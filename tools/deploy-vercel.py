#!/usr/bin/env python3
"""
一键发布到 Vercel 生产环境（国内网络可用版）

背景：本项目已断开 GitHub 自动部署，配图（public/figures）也不再提交到仓库，
所以发布流程改为「本地构建 → 直接上传到 Vercel」。

用法：
    npm run build                 # 先生成 dist（可选，脚本只上传源码，由 Vercel 云端构建）
    python tools/deploy-vercel.py

可选参数：
    --token <vcp_xxx>    Vercel Access Token（默认读环境变量 VERCEL_TOKEN）
    --preview            部署到预览环境（默认 production）
    --no-build           跳过本地构建（默认会先执行 npm run build 做校验）

说明：
    * api.vercel.com 在国内直连常常被阻断。脚本会先探测，不通时自动拉起一个
      本地 CONNECT 代理，把 api.vercel.com 指向可达的 Vercel 边缘 IP，退出即回收。
    * 上传清单 = git 跟踪的文件 + public/figures 下的配图（配图已在 .gitignore 中）。
"""

import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.vercel.com"
FALLBACK_IPS = ["64.239.123.193", "64.239.123.65"]  # api.vercel.com 在这些边缘节点上可达
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_PREFIX = (".env", "check_vm", "fig-demo/", "tools/paper-figures/")
SKIP_EXACT = {".env", "start-local.log"}


# ---------------------------------------------------------------- 本地代理
class LocalProxy:
    """极简 CONNECT 代理：只把 api.vercel.com 改指到可达 IP，其它域名原样转发。"""

    def __init__(self):
        self.override_ip = None
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("127.0.0.1", 0))
        srv.listen(64)
        self.srv = srv
        self.port = srv.getsockname()[1]
        threading.Thread(target=self._serve, daemon=True).start()

    @staticmethod
    def _pipe(src, dst):
        try:
            while True:
                data = src.recv(65536)
                if not data:
                    break
                dst.sendall(data)
        except Exception:
            pass
        finally:
            try:
                dst.shutdown(socket.SHUT_WR)
            except Exception:
                pass
            try:
                src.close()
            except Exception:
                pass

    def _handle(self, conn):
        try:
            conn.settimeout(30)
            buf = b""
            while b"\r\n\r\n" not in buf:
                chunk = conn.recv(4096)
                if not chunk:
                    conn.close()
                    return
                buf += chunk
            head = buf.split(b"\r\n")[0].decode("latin1")
            parts = head.split()
            if len(parts) < 2 or parts[0].upper() != "CONNECT":
                conn.sendall(b"HTTP/1.1 501 Not Implemented\r\nContent-Length: 0\r\n\r\n")
                conn.close()
                return
            rest = buf[buf.index(b"\r\n\r\n") + 4:]
            host, _, port = parts[1].partition(":")
            port = int(port or 443)
            target = self.override_ip if host == "api.vercel.com" else host
            up = socket.create_connection((target, port), timeout=20)
            conn.settimeout(None)
            conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            if rest:
                up.sendall(rest)
            threading.Thread(target=self._pipe, args=(conn, up), daemon=True).start()
            threading.Thread(target=self._pipe, args=(up, conn), daemon=True).start()
        except Exception:
            try:
                conn.close()
            except Exception:
                pass

    def _serve(self):
        while True:
            try:
                c, _ = self.srv.accept()
            except Exception:
                return
            threading.Thread(target=self._handle, args=(c,), daemon=True).start()


def build_opener(token, proxy_port=None):
    if proxy_port:
        handler = urllib.request.ProxyHandler(
            {"http": f"http://127.0.0.1:{proxy_port}", "https": f"http://127.0.0.1:{proxy_port}"}
        )
    else:
        handler = urllib.request.ProxyHandler({})
    return urllib.request.build_opener(handler)


def http_call(opener, token, method, path, data=None, headers=None, timeout=120):
    h = {"Authorization": "Bearer " + token}
    if headers:
        h.update(headers)
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # 网络层失败
        return -1, str(e).encode()


def probe(opener, token):
    code, _ = http_call(opener, token, "GET", "/v9/projects?limit=1", timeout=6)
    return code


def setup_network(token):
    """优先直连；不通则拉起本地代理逐个试可达 IP。"""
    direct = build_opener(token)
    code = probe(direct, token)
    if code > 0:
        print("[net] api.vercel.com 直连可用")
        return direct, None

    print("[net] 直连不通，尝试本地代理 + 边缘 IP …")
    proxy = LocalProxy()
    for ip in FALLBACK_IPS:
        proxy.override_ip = ip
        opener = build_opener(token, proxy.port)
        if probe(opener, token) > 0:
            print(f"[net] 代理可用（api.vercel.com -> {ip}，本地端口 {proxy.port}）")
            return opener, proxy
    print("[net] 所有出口均不可用，请检查网络或自备代理", file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------- 文件与上传
def load_project():
    path = os.path.join(ROOT, ".vercel", "project.json")
    if not os.path.exists(path):
        print(f"[err] 缺少 {path}，请先在本目录执行一次 vercel link", file=sys.stderr)
        sys.exit(2)
    with open(path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    return meta["projectId"], meta.get("orgId") or meta["projectId"]


def collect_files():
    try:
        tracked = subprocess.check_output(["git", "-C", ROOT, "ls-files"], text=True).splitlines()
    except Exception:
        print("[err] 读取 git 文件列表失败（需要 git 仓库）", file=sys.stderr)
        sys.exit(2)
    picked = [f for f in tracked if f and f not in SKIP_EXACT and not f.startswith(SKIP_PREFIX)]

    # 配图已移出版本库，直接作为部署文件上传
    seen = set(picked)
    figs = os.path.join(ROOT, "public", "figures")
    if os.path.isdir(figs):
        for dirpath, _, names in os.walk(figs):
            for name in sorted(names):
                rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace("\\", "/")
                if rel not in seen:
                    picked.append(rel)
                    seen.add(rel)
    return sorted(picked)


def upload_all(opener, token, team, files, workers=3, attempts=4):
    def one(rel):
        with open(os.path.join(ROOT, *rel.split("/")), "rb") as f:
            content = f.read()
        sha = hashlib.sha1(content).hexdigest()
        q = urllib.parse.urlencode({"teamId": team})
        last = ""
        for i in range(attempts):
            code, body = http_call(
                opener,
                token,
                "POST",
                "/v2/files?" + q,
                content,
                {
                    "x-vercel-digest": sha,
                    "Content-Type": "application/octet-stream",
                    "Content-Length": str(len(content)),
                },
                timeout=180,
            )
            if code in (200, 201):
                return {"file": rel, "sha": sha, "size": len(content)}
            last = f"{code} {body[:120]!r}"
            time.sleep(1 + i * 1.5)
        raise RuntimeError(f"{rel}: {last}")

    uploaded, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(one, f): f for f in files}
        for done, fu in enumerate(futs, 1):
            try:
                uploaded.append(fu.result())
            except Exception as e:
                errors.append(str(e))
            if done % 25 == 0:
                print(f"  上传 {done}/{len(files)}")
    if errors:
        for e in errors[:5]:
            print("[err]", e, file=sys.stderr)
        sys.exit(1)
    return uploaded


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", default=os.environ.get("VERCEL_TOKEN", ""))
    ap.add_argument("--preview", action="store_true", help="部署到预览环境")
    ap.add_argument("--no-build", action="store_true", help="跳过本地 npm run build 校验")
    args = ap.parse_args()

    if not args.token:
        print("[err] 缺少 token：设置环境变量 VERCEL_TOKEN 或传 --token", file=sys.stderr)
        sys.exit(2)

    if not args.no_build and not args.preview:
        print("[build] npm run build …")
        r = subprocess.run("npm run build", shell=True, cwd=ROOT)
        if r.returncode != 0:
            print("[err] 本地构建失败，已中止", file=sys.stderr)
            sys.exit(1)

    project, team = load_project()
    opener, proxy = setup_network(args.token)

    files = collect_files()
    total = sum(os.path.getsize(os.path.join(ROOT, *f.split("/"))) for f in files)
    print(f"[plan] {len(files)} 个文件 / {total / 1048576:.2f} MB")

    uploaded = upload_all(opener, args.token, team, files)
    target = "staging" if args.preview else "production"
    payload = {
        "name": os.path.basename(ROOT),
        "project": project,
        "target": target,
        "files": uploaded,
    }
    q = urllib.parse.urlencode({"teamId": team, "forceNew": "1"})
    code, body = http_call(
        opener, args.token, "POST", "/v13/deployments?" + q,
        json.dumps(payload).encode(),
        {"Content-Type": "application/json"},
        timeout=240,
    )
    if code not in (200, 201):
        print(f"[err] 创建部署失败 {code}: {body[:300].decode('utf-8', 'replace')}", file=sys.stderr)
        sys.exit(1)
    info = json.loads(body)
    dep_id, url = info.get("id"), info.get("url")
    print(f"[deploy] {dep_id} -> https://{url}")

    state = ""
    for _ in range(60):
        time.sleep(10)
        code, body = http_call(
            opener, args.token, "GET",
            f"/v13/deployments/{dep_id}?" + urllib.parse.urlencode({"teamId": team}),
        )
        if code != 200:
            continue
        state = json.loads(body).get("readyState", "")
        print(f"  … {state}")
        if state in ("READY", "ERROR", "CANCELED"):
            break
    if state == "READY":
        print(f"[ok] 已上线：https://{url}")
        if not args.preview:
            print("[ok] 生产域名已指向本次部署")
    else:
        print(f"[fail] 部署状态 {state}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
