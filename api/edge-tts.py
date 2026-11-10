from http.server import BaseHTTPRequestHandler
import json
import asyncio
import re
import edge_tts


def sanitize_tts_text(raw_text: str) -> str:
    text = str(raw_text or '')
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'&nbsp;', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'&amp;', ' y ', text, flags=re.IGNORECASE)
    text = re.sub(
        r'(?:&[hH]arr;|&leftrightarrow;|&Leftrightarrow;|\\leftrightarrow\b|<-->|<->|<=>|[↔⇔⟷⟺⇄⇆])',
        ' y ',
        text,
    )
    text = re.sub(
        r'\s*(?:↑|⇑|\\uparrow\b|&uarr;)\s*(?=(?!(?:y|e|o|u|ni|que|pero|con|sin|por|para|en|a|de|al|del)\b)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,})',
        ' aumento de ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\s*(?:↑|⇑|\\uparrow\b|&uarr;)', ' en aumento', text)
    text = re.sub(
        r'\s*(?:↓|⇓|\\downarrow\b|&darr;)\s*(?=(?!(?:y|e|o|u|ni|que|pero|con|sin|por|para|en|a|de|al|del)\b)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]{2,})',
        ' disminución de ',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'\s*(?:↓|⇓|\\downarrow\b|&darr;)', ' en descenso', text)
    text = re.sub(
        r'\s*(?:&[rRlL]arr;|&(?:right|left)arrow;|&(?:Right|Left)arrow;|\\(?:long)?(?:right|left)arrow\b|\\implies\b|\\mapsto\b|\\to\b|(?:--|==|-|=)>|<--?|[\u2190-\u21FF\u2794-\u27BF\u2B00-\u2B7F])\s*',
        ', ',
        text,
    )
    text = re.sub(
        r'\b(?:rightwards?|leftwards?|upwards?|downwards?|bidirectional|left-right|right|left|up|down)\s+arrow(?!\s+function)\b',
        ', ',
        text,
        flags=re.IGNORECASE,
    )
    text = text.replace('≥', ' mayor o igual que ').replace('>=', ' mayor o igual que ')
    text = text.replace('≤', ' menor o igual que ').replace('<=', ' menor o igual que ')
    text = text.replace('≠', ' diferente de ').replace('≈', ' aproximadamente ').replace('±', ' más o menos ')
    text = re.sub(r'[*_#`~[\]$]', '', text)
    text = re.sub(r'\s+([,;:.!?])', r'\1', text)
    text = re.sub(r'([,;:])\s*,+', r'\1', text)
    text = re.sub(r'\s*,\s+(?=(?:y|e|o|u|hacia)\b)', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'^\s*[,;:\-–—]+\s*', '', text)
    text = re.sub(r'\s*[,;]+\s*$', '', text)
    return re.sub(r'\s{2,}', ' ', text).strip()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode('utf-8'))
            text = sanitize_tts_text(data.get('text') or '')
            voice = data.get('voice') or 'es-ES-ElviraNeural'
            rate = data.get('rate')
            pitch = data.get('pitch')

            if not text:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Texto vacio para sintesis'}).encode('utf-8'))
                return

            kwargs = {}
            if rate:
                kwargs['rate'] = rate
            if pitch:
                kwargs['pitch'] = pitch

            async def synth():
                communicate = edge_tts.Communicate(text, voice, **kwargs)
                audio = bytearray()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                return bytes(audio)

            audio_data = asyncio.run(synth())

            if not audio_data:
                raise Exception('No se generaron datos de audio de Azure Neural')

            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(audio_data)))
            self.send_header('Cache-Control', 'public, max-age=86400, s-maxage=86400')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(audio_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
