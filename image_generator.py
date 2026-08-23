"""Utilitários da geração de imagens do Klipza.IA."""
import base64
import json
import os
import threading
from datetime import datetime, timedelta, timezone
from io import BytesIO
import requests
from PIL import Image, ImageDraw, ImageFont
MAX_IMAGES_PER_DAY=3
WINDOW=timedelta(hours=24)
QUOTA_FILE=os.path.join(os.path.dirname(__file__),"data","image-quotas.json")
_QUOTA_LOCK=threading.Lock()
def utc_now(): return datetime.now(timezone.utc)
def _read():
    try:
        with open(QUOTA_FILE,encoding="utf-8") as f: value=json.load(f); return value if isinstance(value,dict) else {}
    except (FileNotFoundError,json.JSONDecodeError,OSError): return {}
def _write(value):
    os.makedirs(os.path.dirname(QUOTA_FILE),exist_ok=True); tmp=QUOTA_FILE+".tmp"
    with open(tmp,"w",encoding="utf-8") as f: json.dump(value,f,ensure_ascii=False,indent=2)
    os.replace(tmp,QUOTA_FILE)
def _active(row,now):
    result=[]
    for raw in (row.get("timestamps",[]) if isinstance(row,dict) else []):
        try:
            moment=datetime.fromisoformat(str(raw).replace("Z","+00:00"))
            if now-moment<WINDOW: result.append(moment)
        except (TypeError,ValueError): pass
    return sorted(result)
def reserve_image(user_id):
    """Consume uma unidade da cota com lock e persistência JSON."""
    now=utc_now(); key=str(user_id)
    with _QUOTA_LOCK:
        data=_read(); active=_active(data.get(key,{}),now)
        reset=(active[0]+WINDOW if active else now).isoformat().replace("+00:00","Z")
        if len(active)>=MAX_IMAGES_PER_DAY: return None,{"limit":3,"used":len(active),"remaining":0,"resetAt":reset}
        active.append(now); data[key]={"timestamps":[x.isoformat().replace("+00:00","Z") for x in active]}; _write(data)
        return {"limit":3,"used":len(active),"remaining":3-len(active),"resetAt":reset},None
def improve_prompt(prompt):
    """Acrescenta acabamento sem apagar o prompt do usuário."""
    return " ".join(str(prompt or "").split()).strip()[:1200]+", alta qualidade, 4k, detalhado, profissional"
def _watermark(image):
    """Aplica klipza.ia no canto inferior direito."""
    image=image.convert("RGBA"); draw=ImageDraw.Draw(image,"RGBA")
    try: font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",max(18,image.width//42))
    except OSError: font=ImageFont.load_default()
    label="klipza.ia"; box=draw.textbbox((0,0),label,font=font); pad=max(12,image.width//80); w,h=box[2]-box[0],box[3]-box[1]; x=image.width-w-pad*2; y=image.height-h-pad*2
    draw.rounded_rectangle((x,y,x+w+pad*2,y+h+pad*2),radius=pad,fill=(8,12,20,180)); draw.text((x+pad,y+pad-box[1]),label,font=font,fill=(255,255,255,240)); return image
def generate_image(prompt):
    """Gera com Pollinations Flux e retorna data URL JPEG já marcado."""
    url="https://image.pollinations.ai/prompt/"+requests.utils.quote(improve_prompt(prompt),safe="")
    response=requests.get(url,params={"model":"flux","nologo":"true"},timeout=90); response.raise_for_status(); image=Image.open(BytesIO(response.content)); output=BytesIO(); _watermark(image).convert("RGB").save(output,format="JPEG",quality=92,optimize=True)
    return "data:image/jpeg;base64,"+base64.b64encode(output.getvalue()).decode("ascii")
