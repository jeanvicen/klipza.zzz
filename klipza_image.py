# klipza_image.py
# Módulo para geração de imagens usando Pollinations.ai (grátis, sem chave API)
# Regras implementadas:
# - Detecta tags [CRIAR_IMAGEM]...[/CRIAR_IMAGEM] em um texto de resposta da IA
# - Extrai prompt(s), melhora automaticamente, chama o endpoint do Pollinations
# - Sistema de cota: 3 imagens por usuário POR DIA (24h), persistido em data/image_quotas.json
# - Marca d'água "klipza.ia" aplicada no canto inferior direito de TODAS as imagens
# - Gera um bloco HTML com animação (quadrado com "rabiscos") que mostra a criação
# - Permite que o usuário faça download da imagem (com marca d'água) via botão
# - NÃO altera o funcionamento normal da IA; é um módulo que você chama onde precisar

import os
import time
import json
import requests
import re
import base64
from io import BytesIO
from urllib.parse import quote_plus
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Configurações
DATA_DIR = "data"
IMAGES_DIR = "images"
QUOTA_FILE = os.path.join(DATA_DIR, "image_quotas.json")
QUOTA_PER_DAY = 3
QUOTA_WINDOW_SECONDS = 24 * 3600  # 24 horas
WATERMARK_TEXT = "klipza.ia"
# Se quiser forçar uma fonte TTF local, coloque o caminho aqui. Caso contrário usa fonte padrão.
FONT_PATH = None  # Ex: "./fonts/Inter-Bold.ttf"

# Garante que diretórios existam
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

# Inicializa arquivo de cotas se não existir
if not os.path.exists(QUOTA_FILE):
    with open(QUOTA_FILE, "w", encoding="utf-8") as f:
        json.dump({}, f)


# ---------- Funções de cota (persistidas em JSON) ----------

def _load_quotas():
    """Carrega o JSON de cotas (dicionário user_id -> {count, reset})."""
    try:
        with open(QUOTA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_quotas(q):
    """Salva o dicionário de cotas no arquivo."""
    with open(QUOTA_FILE, "w", encoding="utf-8") as f:
        json.dump(q, f, ensure_ascii=False, indent=2)


def _get_reset_dt_from_timestamp(ts):
    return datetime.fromtimestamp(ts)


def check_and_consume_quota(user_id):
    """
    Verifica a cota do usuário. Se houver cota disponível, consome 1 e retorna (True, info).
    Se não houver, retorna (False, info) onde info contém a data de reset.

    Info retornado em formato dict:
      {"count": int, "reset": unix_timestamp}
    """
    q = _load_quotas()
    now = int(time.time())
    u = q.get(user_id)

    if u is None:
        # cria entrada nova com janela de 24h a partir de agora
        q[user_id] = {"count": 0, "reset": now + QUOTA_WINDOW_SECONDS}
        u = q[user_id]

    # Se já passou o tempo de reset, renovamos a janela e zeramos contador
    if now >= u.get("reset", 0):
        u["count"] = 0
        u["reset"] = now + QUOTA_WINDOW_SECONDS

    if u["count"] >= QUOTA_PER_DAY:
        # sem cota
        _save_quotas(q)
        return False, {"count": u["count"], "reset": u["reset"]}

    # consome 1
    u["count"] += 1
    q[user_id] = u
    _save_quotas(q)
    return True, {"count": u["count"], "reset": u["reset"]}


# ---------- Funções de geração de imagem Pollinations ----------

def _augment_prompt(prompt):
    """Melhora automaticamente o prompt conforme solicitado pelo usuário."""
    additions = ", alta qualidade, 4k, detalhado, profissional"
    # Evita duplicar se já contiver palavras-chave (case-insensitive)
    lowered = prompt.lower()
    if "alta qualidade" in lowered or "4k" in lowered or "detalhado" in lowered:
        return prompt + additions
    return prompt + additions


def _fetch_image_from_pollinations(prompt_augmented, timeout=60):
    """
    Chama o endpoint público do Pollinations. Usa a forma sem API key.
    Tentamos setar model=flux como query param — se o serviço não aceitar, ainda assim
    costuma retornar uma imagem.

    Retorna bytes da imagem (PNG/JPEG) ou levanta exceção em caso de erro.
    """
    # Encode do prompt para URL
    encoded = quote_plus(prompt_augmented)
    # Endpoint simples: https://image.pollinations.ai/prompt/{prompt}
    url = f"https://image.pollinations.ai/prompt/{encoded}?model=flux"

    resp = requests.get(url, stream=True, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"Falha ao gerar imagem (status {resp.status_code})")

    return resp.content


# ---------- Marca d'água ----------

def _apply_watermark(image_bytes):
    """
    Recebe bytes de imagem, aplica watermark no canto inferior direito e retorna bytes PNG.
    """
    with Image.open(BytesIO(image_bytes)).convert("RGBA") as base:
        width, height = base.size

        # Criar camada RGBA para watermark
        txt = Image.new("RGBA", base.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(txt)

        # Fonte: tentar carregar TTF, senão usar fonte padrão
        try:
            if FONT_PATH and os.path.exists(FONT_PATH):
                font = ImageFont.truetype(FONT_PATH, max(14, width // 40))
            else:
                font = ImageFont.load_default()
        except Exception:
            font = ImageFont.load_default()

        text = WATERMARK_TEXT
        text_width, text_height = draw.textsize(text, font=font)
        padding = max(8, width // 120)

        # Posicionar no canto inferior direito com margem
        x = width - text_width - padding
        y = height - text_height - padding

        # Desenhar um retângulo semi-transparente por trás do texto para legibilidade
        rect_margin = 4
        rect_x0 = x - rect_margin
        rect_y0 = y - rect_margin
        rect_x1 = x + text_width + rect_margin
        rect_y1 = y + text_height + rect_margin

        draw.rectangle([rect_x0, rect_y0, rect_x1, rect_y1], fill=(0, 0, 0, 120))

        # Desenhar texto em branco
        draw.text((x, y), text, font=font, fill=(255, 255, 255, 220))

        # Compor e salvar em bytes PNG
        out = Image.alpha_composite(base, txt)
        with BytesIO() as output:
            out.convert("RGB").save(output, format="PNG")
            return output.getvalue()


# ---------- Pipeline principal ----------

def generate_image_for_prompt(prompt, user_id):
    """
    Gera a imagem para um único prompt, respeitando cota, retornando um dicionário com resultado.

    Retorna:
      {"ok": True, "html": "<...>", "image_path": "images/....png"}
    ou
      {"ok": False, "error": "mensagem amigável", "quota_exhausted": True/False}
    """
    # 1) Checar quota
    allowed, info = check_and_consume_quota(user_id)
    if not allowed:
        # quando a cota for atingida, retornamos uma mensagem simples conforme solicitado
        return {
            "ok": False,
            "error": "você atingiu o limite de cota de imagens por hoje",
            "quota_exhausted": True,
            "reset_ts": info.get("reset"),
        }

    # 2) Preparar prompt melhorado
    prompt_aug = _augment_prompt(prompt.strip())

    # 3) Chamar Pollinations
    try:
        raw_bytes = _fetch_image_from_pollinations(prompt_aug)
    except Exception as e:
        return {"ok": False, "error": f"Erro ao gerar imagem: {e}", "quota_exhausted": False}

    # 4) Aplicar watermark
    try:
        watermarked = _apply_watermark(raw_bytes)
    except Exception as e:
        return {"ok": False, "error": f"Erro ao aplicar watermark: {e}", "quota_exhausted": False}

    # 5) Salvar arquivo final
    ts = int(time.time())
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", prompt[:50])
    filename = f"img_{user_id}_{ts}_{safe_name}.png"
    path = os.path.join(IMAGES_DIR, filename)
    with open(path, "wb") as f:
        f.write(watermarked)

    # 6) Gerar HTML com animação que mostra a criação (o bloco irá mostrar animação por alguns segundos e depois mostrar a imagem final)
    #    O HTML embute a imagem em base64 para que não dependa de um servidor estático adicional.
    b64 = base64.b64encode(watermarked).decode("ascii")
    img_data_url = f"data:image/png;base64,{b64}"

    html = _make_animation_html(img_data_url, filename)

    return {"ok": True, "html": html, "image_path": path}


def _make_animation_html(img_data_url, filename_for_download):
    """
    Cria um bloco HTML que mostra uma animação tipo "quadrado bonito com rabiscos" enquanto
    a imagem está sendo criada, e depois mostra a imagem final. Inclui botão de download
    que permite ao usuário baixar a imagem com a marca d'água.

    A animação é apenas visual/estética: no fluxo desta biblioteca a imagem já foi gerada
    antes de retornarmos o HTML — aqui simulamos o comportamento do ChatGPT mostrando um
    processo "meio demorado" (2.8s) para fins estéticos.
    """
    # Nome de arquivo de download
    safe_download_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename_for_download)

    html = f"""
<div style="width:100%;max-width:640px;margin:12px auto;font-family:Arial,Helvetica,sans-serif;">
  <style>
  /* Quadrado bonito */
  .klipza-anim-wrapper {{ position: relative; width:100%; padding-top:100%; background:#111; border-radius:12px; overflow:hidden; }}
  .klipza-anim-canvas {{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }}
  .klipza-scribble {{ width:80%; height:80%; background:linear-gradient(135deg,#222,#333); border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.6); position:relative; overflow:hidden; }}
  .klipza-scribble::before {{ content:''; position:absolute; inset:0; background-image:repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 6px, transparent 6px 12px); animation:scrib 1.2s linear infinite; mix-blend-mode:overlay; }}
  @keyframes scrib {{ from{{ transform:translateX(-20%); }} to{{ transform:translateX(20%); }} }}

  /* Placeholder para rabiscos desenhando */
  .klipza-doodle {{ position:absolute; inset:8px; border-radius:6px; }}

  /* Fade-in da imagem final */
  .klipza-final {{ display:block; width:100%; height:auto; border-radius:8px; opacity:0; transition:opacity .6s ease-in; }}
  .klipza-final.show {{ opacity:1; }}

  /* Estilo do botão de download */
  .klp-download {{ display:inline-block; margin-top:10px; padding:8px 12px; background:#0b84ff; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; }}
  .klp-download:hover {{ background:#076fd6; }}
  </style>

  <div class="klipza-anim-wrapper" role="img" aria-label="Gerando imagem...">
    <div class="klipza-anim-canvas">
      <div class="klipza-scribble" id="klp-scribble">
        <svg class="klipza-doodle" viewBox="0 0 200 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path id="p" d="M10 10 C 50 80, 150 20, 190 190" stroke="#bbbbbb" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <img id="klp-final-img" class="klipza-final" src="{img_data_url}" alt="Imagem gerada" />
    </div>
  </div>

  <div style="text-align:center;">
    <a id="klp-download-btn" class="klp-download" href="{img_data_url}" download="{safe_download_name}">Download da imagem (com marca d'água)</a>
  </div>

  <script>
    // Simula um processo de criação demoradinho e então mostra a imagem final
    (function() {{
      const showDelay = 2800; // 2.8s, "meio demorado" estético
      const final = document.getElementById('klp-final-img');
      setTimeout(() => {{
        final.classList.add('show');
        // remover a camada de rabisco para ficar só a imagem
        const scrib = document.getElementById('klp-scribble');
        if (scrib) scrib.style.visibility = 'hidden';
      }}, showDelay);
    }})();
  </script>
</div>
"""
    return html


# ---------- Integração: detectar tags em resposta da IA ----------

def process_ai_response(response_text, user_id):
    """
    Detecta trechos marcados por [CRIAR_IMAGEM]...[/CRIAR_IMAGEM] em response_text.
    Para cada trecho encontrado, gera a imagem (respeitando cota) e substitui o bloco
    original por um HTML embutido com a animação e a imagem final.

    Se não houver tags, retorna o texto original (sem alterar o funcionamento da IA).

    Retorna um dict com:
      {"ok": True, "text": "texto com blocos HTML embutidos"}
    ou
      {"ok": False, "error": "mensagem"}

    Nota: este método não faz chamadas assíncronas; gera a imagem de forma síncrona.
    """
    # Encontrar todas as tags (case-insensitive, multiline)
    matches = re.findall(r"\[CRIAR_IMAGEM\](.*?)\[/CRIAR_IMAGEM\]", response_text, re.S | re.I)
    if not matches:
        # nada a fazer
        return {"ok": True, "text": response_text}

    new_text = response_text
    # Para cada prompt, geramos a imagem e substituímos o bloco
    for prompt in matches:
        prompt_clean = prompt.strip()
        if not prompt_clean:
            replacement = "<p><em>Prompt vazio para criação de imagem.</em></p>"
        else:
            result = generate_image_for_prompt(prompt_clean, user_id)
            if not result.get("ok"):
                # Se falha (ex.: sem cota), mostramos mensagem simples quando for cota esgotada
                if result.get('quota_exhausted'):
                    # Mostrar APENAS esta mensagem curta conforme solicitado
                    replacement = "<p>você atingiu o limite de cota de imagens por hoje</p>"
                else:
                    # Erros técnicos exibem mensagem amigável detalhada
                    replacement = f"<div style='color:#b22222;padding:10px;border-radius:8px;background:#fff4f4;'>Erro ao gerar imagem: {result.get('error')}</div>"
            else:
                replacement = result.get("html")
        # Substituir apenas a primeira ocorrência correspondente para permitir prompts idênticos
        new_text = re.sub(r"\[CRIAR_IMAGEM\]" + re.escape(prompt) + r"\[/CRIAR_IMAGEM\]", replacement, new_text, count=1, flags=re.S | re.I)

    return {"ok": True, "text": new_text}


# ---------- Exemplo / Teste local ----------
if __name__ == "__main__":
    # Teste rápido — customize user_id conforme necessário
    sample = "Aqui vai a resposta da IA. [CRIAR_IMAGEM]Uma paisagem futurista com montanhas e um lago ao pôr do sol[/CRIAR_IMAGEM] e segue a conversa."
    print("Processando resposta e gerando imagem (pode demorar alguns segundos)...")
    out = process_ai_response(sample, user_id="testuser")
    if out.get("ok"):
        print("Resultado (trecho):")
        print(out.get("text")[:1000])
    else:
        print("Erro:", out.get("error"))
