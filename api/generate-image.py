"""Endpoint autenticado de geração de imagens por tags da IA."""
import json,os,re
import requests
from image_generator import generate_image,reserve_image
TAG_RE=re.compile(r"\[CRIAR_IMAGEM\](.*?)\[/CRIAR_IMAGEM\]",re.I|re.S)
def send(h,status,body):
    data=json.dumps(body,ensure_ascii=False).encode(); h.send_response(status); h.send_header("Access-Control-Allow-Origin","*"); h.send_header("Access-Control-Allow-Headers","Authorization, Content-Type"); h.send_header("Content-Type","application/json; charset=utf-8"); h.send_header("Cache-Control","no-store"); h.send_header("Content-Length",str(len(data))); h.end_headers(); h.wfile.write(data)
def user_id(h):
    token=str(h.headers.get("Authorization","")).replace("Bearer ","",1).strip(); base=os.environ.get("SUPABASE_URL","").rstrip("/"); key=os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
    if not token or not base or not key:return None
    check=requests.get(base+"/auth/v1/user",headers={"Authorization":"Bearer "+token,"apikey":key},timeout=15); return (check.json() or {}).get("id") if check.ok else None
class handler:
    def __init__(self): pass
    def do_OPTIONS(self): send(self,204,{})
    def do_POST(self):
        try:
            uid=user_id(self)
            if not uid:return send(self,401,{"error":"Sua sessão expirou. Entre novamente para continuar."})
            length=min(int(self.headers.get("Content-Length","0")),20000); body=json.loads(self.rfile.read(length) or b"{}"); answer=str(body.get("answer",""))[:16000]; matches=TAG_RE.findall(answer); images=[]
            for prompt in matches[:3]:
                quota,denied=reserve_image(uid)
                if denied:return send(self,429,{"error":"Você atingiu o limite de 3 imagens nas últimas 24 horas. Tente novamente após "+denied["resetAt"]+".","resetAt":denied["resetAt"],"quota":denied})
                images.append({"data":generate_image(prompt),"name":"imagem-klipza.jpg","type":"image/jpeg","quota":quota})
            return send(self,200,{"answer":TAG_RE.sub("",answer).strip(),"images":images})
        except requests.RequestException:return send(self,502,{"error":"Não consegui concluir a imagem agora. A resposta da IA continua disponível."})
        except Exception:return send(self,500,{"error":"A imagem não pôde ser criada agora. A resposta da IA continua disponível."})
