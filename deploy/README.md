# physics-lab · Cloudflare Tunnel 部署

## 原理

本机运行 `node server/index.mjs`，它**一个进程同时**托管前端 `dist/` 与 `/api` 鉴权后端（默认端口 `3001`）。
Cloudflare Tunnel 把公网流量**安全地反向转发**到本机 `3001`，因此：

- ✅ **零代码改造** —— 沿用现有 Node 后端，登录/进度功能原样可用
- ✅ **免公网服务器** —— 不需要买 VPS
- ✅ **自带 HTTPS** —— Cloudflare 自动签发证书，不暴露你本机 IP
- ✅ **穿透家庭网络** —— 反向连接，不怕动态 IP、不怕运营商封 80/443

代价：本机必须常驻在线；上行带宽决定访问速度；数据存在本机 `server/data/users.json`。

---

## 前置条件

1. **Node.js**（项目用 22.x，已具备）
2. **一个托管在 Cloudflare 的域名**（免费版即可）
3. **安装 cloudflared** 并加入系统 `PATH`
   - Windows: 下载 `cloudflared-windows-amd64.exe`，重命名为 `cloudflared.exe` 放到 `PATH` 目录
   - macOS: `brew install cloudflared`
   - Linux: `sudo apt install cloudflared` 或官方 deb

验证：`cloudflared --version`

---

## 一次性准备（只需做一次）

```bash
# 1. 登录 Cloudflare (浏览器选你的域名)
cloudflared tunnel login

# 2. 创建隧道, 记下输出的 Tunnel ID
cloudflared tunnel create physics-lab

# 3. 编辑 deploy/config.yml:
#    - 把 <TUNNEL_ID> 换成上一步的真实 ID
#    - 把 credentials-file 路径里的 <TUNNEL_ID> 一并替换
#    - 把 hostname 改成你的子域名, 例如 lab.yourdomain.com

# 4. (首次) 把子域名解析指向该隧道
cloudflared tunnel route dns physics-lab lab.yourdomain.com
```

> credentials 文件默认在 `C:\Users\Administrator\.cloudflared\<TUNNEL_ID>.json`，
> Linux/macOS 在 `~/.cloudflared/<TUNNEL_ID>.json`。

---

## 日常启动

**Windows**：双击 `deploy/start.bat`
**Linux / macOS**：`bash deploy/start.sh`

脚本会自动：① `vite build` 构建前端 → ② 后台启动 Node(3001) → ③ 拉起 Cloudflare Tunnel。

启动成功后，浏览器访问 `https://lab.yourdomain.com` 即可（前端 + 登录全通）。

---

## 停止

- `Ctrl+C` 关掉 Cloudflare 窗口
- 再运行 `deploy/stop.bat` 结束 Node 进程
- （Linux/macOS 的 `start.sh` 在 `Ctrl+C` 时会自动结束 Node）

---

## 没有域名？临时体验

不想配域名时，直接起一个临时隧道（会生成 `*.trycloudflare.com` 地址，重启后变化）：

```bash
# 先手工启动后端
node server/index.mjs
# 另开一个终端
cloudflared tunnel --url http://localhost:3001
```

---

## 替代方案：Cloudflare 注册失败 → 国内穿透（cpolar）

如果 `dash.cloudflare.com` 注册被 403 拦死（国内网络常见），改用 **cpolar**（国内 SaaS，免 Cloudflare 账号、国内访问稳、免费档可用）。同样是零代码改造。

### 一次性准备
1. 注册 [cpolar.cn](https://cpolar.cn)（国内可正常注册）
2. 下载 cpolar 客户端，解压得 `cpolar.exe` 放入 `PATH`
3. 后台「验证」页复制 authtoken，执行一次：
   ```bash
   cpolar authtoken <你的token>
   ```

### 日常启动
双击 `deploy/start-cpolar.bat`（脚本会 build → 起 Node(3001) → 起 cpolar）。
控制台输出公网地址，例如：
```
Forwarding  https://xxxx.cpolar.io -> http://localhost:3001
Forwarding  http://xxxx.cpolar.io  -> http://localhost:3001
```
浏览器开那个 `https://` 地址即可（前端 + 登录全通）。

> 免费版隧道地址每次重启会变化；需要固定地址需 cpolar 付费套餐。
> 同理也可换 natapp / 花生壳，命令与原理一致（隧道指向本机 3001）。

---

## 替代方案二：你有 SakuraFrp（樱花内网穿透）

SakuraFrp 是现成的 frp 节点服务（免自建服务器），比 cpolar 更原生、地址可固定。步骤：

1. 登录 [sakurafrp.com](https://sakurafrp.com)（需完成实名，国内服务要求）。
2. 后台「隧道列表」→「创建隧道」：
   - 节点：选离你近的（如 上海 / 广东）
   - 类型：**HTTP**（免费送 `xxx.sakurafrp.top` 子域；要 HTTPS 同理选 HTTPS）
   - 本地地址 `127.0.0.1`，本地端口 `3001`
   - **绑定域名**（HTTP(S) 类型才有）：⚠️ **不要手填 `xxx.sakurafrp.top` 子域**——SakuraFrp 只对「系统自动分配」的免费子域做 DNS 解析，手填的子域会 DNS 解析不到（NXDOMAIN）导致打不开（已实测：`phlab.sakurafrp.top` NXDOMAIN）。正确填法三选一：①**留空**，保存后 SakuraFrp 自动分配一个已解析的 `随机.sakurafrp.top` 免费子域（推荐）；②填**你自己的真实域名**，并去其 DNS 加 CNAME → `frp-air.com`（大陆节点需该域名已 ICP 备案）；③或见下方「TCP 隧道」方案彻底免域名。
   - 创建后得到 **隧道 ID**

   > ⚠️ **备案门槛**：在大陆节点创建 HTTP(S) 隧道前，需先到「用户信息 → 验证备案」提交**已备案域名的 ICP 备案号**完成验证（SakuraFrp 合规要求，绕不过）。
   > **没有已备案域名**时，创建隧道请直接选**海外节点**（香港 / 日本 / 美国等），海外节点**免备案验证**，可用但国内访问延迟更高。
3. 后台「个人信息」复制 **访问密钥（AccessToken）**。
4. 下载 SakuraFrp 的 **Frpc 命令行版**，得到 `frpc.exe` 放入 `PATH`。
5. 双击 `deploy/start-sakura.bat`（build → Node3001 → `frpc -f 访问密钥:隧道ID`）。
   控制台显示 `online` 后即可用给的 `https://xxx.sakurafrp.top` 访问（前端 + 登录全通）。

> 免费档限速 / 限流量；隧道 ID 固定则域名不变（优于 cpolar 每次随机）。
> 大陆节点建 HTTP(S) 隧道需「验证备案」（ICP 备案号）；无备案域名则选**海外节点**免备案，代价是国内访问稍慢。
> **完全不想碰域名？** 创建隧道改选 **TCP 类型**（海外节点，本地 127.0.0.1:3001），TCP 隧道**没有「绑定域名」字段**，彻底绕开必填；访问地址形如 `节点域名:远程端口`。
> ⚠️ **TCP 隧道必须用 HTTPS 访问**：SakuraFrp 对明文 `http://` 访问会合规拦截并返回 501（页面提示「请使用 HTTPS 访问此隧道 / 执行机房内容合规」）。解决：编辑隧道开启 **「自动 HTTPS」**，然后用 `https://节点域名:远程端口` 访问（浏览器若提示证书风险，属 SakuraFrp 节点证书，点「继续访问」即可）。同时本机 `node server/index.mjs`(3001) 必须处于运行态，否则转发无目标。

### 重启电脑后如何恢复（最常见场景）

重启 / 关机 / 睡眠唤醒后，**本机的 Node 后端和 frpc 客户端都会随之关闭**，但 SakuraFrp 后台的隧道配置、自动 HTTPS 开关、实名信息都还在云端，**不用重新创建隧道**。只需在你电脑上重新拉起两个进程即可。

**最简方案（推荐）**：确认 `deploy/start-sakura.bat` 第 13–14 行已填入真实 `SAKURA_TOKEN` 和 `SAKURA_TUNNEL_ID`（若还是 `__你的访问密钥__` 占位符，先填好），然后**双击 `start-sakura.bat`** —— 脚本自动 `vite build` → 后台起 Node(3001) → 起 `frpc` 连上隧道，一次到位。

**手动分步方案**（脚本出问题或想看清每一步时）：

1. 启动后端（新开终端）：
   ```bat
   cd D:\project\physics-lab
   node server/index.mjs
   ```
   看到 `[auth] 鉴权服务已启动: http://localhost:3001` 即成功。
   > 若之前没构建过前端，先 `npx vite build` 一次，否则页面会显示「未找到 dist/」。
2. 确认后端在跑：浏览器开 `http://localhost:3001/` 能看到 physics-lab 页面（这是访问公网前的本地自检，能开才说明后端 OK）。
3. 启动隧道（另一个终端，TCP 隧道）：
   ```bat
   frpc.exe -f 你的访问密钥:你的隧道ID
   ```
   显示 `隧道启动成功` 即连上。
4. 公网访问（**必须用 https**，TCP 隧道明文 http 会被合规拦截 501）：
   ```
   https://frp-rib.com:34688
   ```
   浏览器若提示证书风险，属 SakuraFrp 节点证书，点「继续访问」即可进入前端 + 登录。

> 端口 `34688`、节点域名 `frp-rib.com` 来自你这次的 TCP 隧道，重启后**不变**（隧道 ID 固定即地址固定）。
> ⚠️ **手机显示「未找到构建产物 dist/」** = 本机 `dist/` 不存在（多半是重启后只手动起了 `node server/index.mjs` 却忘了 build）。解决：在 `D:\project\physics-lab` 跑一次 `npm run build` 生成 `dist/`，然后**刷新手机即可**（后端每次请求实时检查 dist，无需重启 Node）。用 `start-sakura.bat` 双击会自动 build，不会出现此问题。

---

## 注意事项

- **本机需常驻在线**：关机 / 断网 / 睡眠 = 服务全挂。仅适合个人 demo、小范围分享。
- **上行带宽瓶颈**：家庭宽带上行通常较弱，多人并发会卡。
- **数据备份**：用户数据在 `server/data/users.json`，定期备份该文件。
- **端口变更**：若用 `PORT` 环境变量改了后端端口，需同步修改 `deploy/config.yml` 的 `service: http://localhost:<端口>`。
- **HTTPS 强制**：Cloudflare 默认给隧道 HTTPS；如需 HTTP 跳转/HTTP 严格，可在 Cloudflare 面板配置。
