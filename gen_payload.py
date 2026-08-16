import json, os, sys

files_info = [
    ("src/components/lab/LensLab.vue", "D:\\project\\physics-lab\\src\\components\\lab\\LensLab.vue"),
    ("src/style.css", "D:\\project\\physics-lab\\src\\style.css"),
    ("package.json", "D:\\project\\physics-lab\\package.json"),
    ("src/components/lab/test_lens.vue", "D:\\project\\physics-lab\\src\\components\\lab\\test_lens.vue"),
    ("src/components/lab/write_lens_temp.py", "D:\\project\\physics-lab\\src\\components\\lab\\write_lens_temp.py"),
    ("_write_lens.py", "D:\\project\\physics-lab\\_write_lens.py"),
]

files = []
for path, filepath in files_info:
    with open(filepath, "r", encoding="utf-8-sig") as f:
        content = f.read()
    files.append({"path": path, "content": content})

payload = {
    "owner": "jolon1019",
    "repo": "physics-lab",
    "branch": "master",
    "message": "feat: 凸透镜成像实验重构 - 使用F形LED光源并完善光路系统",
    "files": files
}

json_str = json.dumps(payload, ensure_ascii=False)
print(f"JSON payload size: {len(json_str)} bytes")

with open("D:\\project\\physics-lab\\temp_push_payload.json", "w", encoding="utf-8") as f:
    f.write(json_str)
print("Done")