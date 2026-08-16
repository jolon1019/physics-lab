import json
with open("D:\\project\\physics-lab\\temp_push_payload.json", "r", encoding="utf-8") as f:
    data = json.load(f)
print("Files count:", len(data["files"]))
print("Keys:", list(data.keys()))
print("Message:", data["message"])
for f in data["files"]:
    print(f'  {f["path"]}: {len(f["content"])} chars')
# Verify content integrity
for f in data["files"]:
    content = f["content"]
    # Check for any null bytes or encoding issues
    if "\x00" in content:
        print(f"  WARNING: null bytes in {f['path']}")
    # Verify first and last few chars
    print(f'  First 50 chars of {f["path"]}: {repr(content[:50])}')
print("Payload is valid JSON!")