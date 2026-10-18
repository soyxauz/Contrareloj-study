import sys
import json
import base64
import asyncio
import edge_tts

async def synthesize(text, voice, rate=None, pitch=None):
    kwargs = {}
    if rate:
        kwargs['rate'] = rate
    if pitch:
        kwargs['pitch'] = pitch
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    audio_data = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
    return bytes(audio_data)

async def main():
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    loop = asyncio.get_event_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            text = req.get("text", "")
            voice = req.get("voice", "es-ES-ElviraNeural")
            rate = req.get("rate")
            pitch = req.get("pitch")
            audio_bytes = await synthesize(text, voice, rate=rate, pitch=pitch)
            b64 = base64.b64encode(audio_bytes).decode('ascii')
            resp = json.dumps({"id": req_id, "success": True, "audio": b64})
            sys.stdout.write(resp + "\n")
            sys.stdout.flush()
        except Exception as e:
            resp = json.dumps({"id": req_id, "success": False, "error": str(e)})
            sys.stdout.write(resp + "\n")
            sys.stdout.flush()

if __name__ == '__main__':
    asyncio.run(main())
