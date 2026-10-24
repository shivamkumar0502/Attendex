import os,json,sqlite3,secrets,hashlib,hmac,time
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
ROOT=Path(__file__).parent
DB=os.environ.get('DATABASE_PATH',str(ROOT/'data/attendex.db'));Path(DB).parent.mkdir(parents=True,exist_ok=True)
def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');return c
with db() as c:
 c.executescript('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT);CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,name TEXT,section TEXT,code TEXT UNIQUE,teacher TEXT REFERENCES users(id));CREATE TABLE IF NOT EXISTS members(class_id TEXT REFERENCES classes(id),student TEXT REFERENCES users(id),PRIMARY KEY(class_id,student));CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),created INTEGER,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS attendance(lesson TEXT REFERENCES lessons(id),student TEXT REFERENCES users(id),status TEXT,PRIMARY KEY(lesson,student));''')
def pw(p,s=None):
 s=s or secrets.token_hex(16);return s+':'+hashlib.scrypt(p.encode(),salt=s.encode(),n=16384,r=8,p=1).hex()
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'public'),**kw)
 def reply(self,d,status=200,cookie=None):
  b=json.dumps(d).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store')
  if cookie:self.send_header('Set-Cookie',cookie)
  self.end_headers();self.wfile.write(b)
 def do_GET(self):
  if self.path.startswith('/api/'):self.api('GET')
  else:super().do_GET()
 def do_POST(self):self.api('POST')
 def api(self,method):
  try:
   n=int(self.headers.get('Content-Length',0))
   if n>16384:return self.reply({'error':'Request too large'},413)
   d=json.loads(self.rfile.read(n) or b'{}') if method=='POST' else {};path=self.path;now=int(time.time())
   if method=='POST' and self.headers.get('Origin') and self.headers['Origin'].split('://')[-1]!=self.headers.get('Host'):return self.reply({'error':'Invalid origin'},403)
   with db() as c:
    ck=SimpleCookie(self.headers.get('Cookie',''));t=ck['session'].value if 'session' in ck else '';hashed=hashlib.sha256(t.encode()).hexdigest()
    u=c.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',(hashed,now)).fetchone()
    if path in ['/api/register','/api/login'] and method=='POST':
     email=str(d.get('email','')).strip().lower();p=str(d.get('password',''))
     if len(p)>128:return self.reply({'error':'Invalid credentials'},400)
     if path.endswith('register'):
      name=str(d.get('name','')).strip();role=d.get('role')
      if not name or len(name)>100 or '@' not in email or len(email)>254 or len(p)<10 or role not in ['teacher','student']:return self.reply({'error':'Enter valid details; password must be at least 10 characters.'},400)
      c.execute('INSERT INTO users VALUES(?,?,?,?,?)',(secrets.token_hex(12),name,email,pw(p),role))
     u=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
     if not u or not hmac.compare_digest(pw(p,u['password'].split(':')[0]),u['password']):return self.reply({'error':'Invalid email or password'},401)
     t=secrets.token_urlsafe(32);c.execute('DELETE FROM sessions WHERE expires<?',(now,));c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(t.encode()).hexdigest(),u['id'],now+86400))
     return self.reply({'ok':True},cookie='session='+t+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'+('; Secure' if os.getenv('COOKIE_SECURE')=='1' else ''))
    if not u:return self.reply({'error':'Please sign in'},401)
    uid=u['id'];teacher=u['role']=='teacher'
    if path=='/api/logout' and method=='POST':
     c.execute('DELETE FROM sessions WHERE token=?',(hashed,));return self.reply({'ok':True},cookie='session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
    if path=='/api/state' and method=='GET':
     rows=c.execute('SELECT * FROM classes WHERE teacher=?' if teacher else 'SELECT c.* FROM classes c JOIN members m ON m.class_id=c.id WHERE m.student=?',(uid,)).fetchall();out=[]
     for row in rows:
      v=dict(row);v['students']=[dict(r) for r in c.execute('SELECT u.id,u.name FROM users u JOIN members m ON m.student=u.id WHERE m.class_id=?',(row['id'],))];v['lessons']=[dict(r) for r in c.execute('SELECT * FROM lessons WHERE class_id=? ORDER BY created DESC',(row['id'],))];v['attendance']=[dict(r) for r in c.execute('SELECT a.* FROM attendance a JOIN lessons l ON l.id=a.lesson WHERE l.class_id=?'+('' if teacher else ' AND a.student=?'),(row['id'],) if teacher else (row['id'],uid))];out.append(v)
     return self.reply({'user':{k:u[k] for k in ['id','name','role']},'classes':out})
    if path=='/api/classes' and method=='POST' and teacher:
     name=str(d.get('name','')).strip();section=str(d.get('section','')).strip()
     if not name or len(name)>100 or len(section)>80:return self.reply({'error':'Enter a class name (up to 100 characters)'},400)
     c.execute('INSERT INTO classes VALUES(?,?,?,?,?)',(secrets.token_hex(12),name,section,secrets.token_hex(4).upper(),uid));return self.reply({'ok':True})
    if path=='/api/join' and method=='POST' and not teacher:
     cl=c.execute('SELECT * FROM classes WHERE code=?',(str(d.get('code','')).strip().upper(),)).fetchone()
     if not cl:return self.reply({'error':'Class code not found'},404)
     c.execute('INSERT OR IGNORE INTO members VALUES(?,?)',(cl['id'],uid));return self.reply({'ok':True})
    if path=='/api/lessons' and method=='POST' and teacher:
     cl=c.execute('SELECT * FROM classes WHERE id=? AND teacher=?',(d.get('classId'),uid)).fetchone()
     if not cl:return self.reply({'error':'Class not found'},404)
     c.execute('UPDATE lessons SET active=0 WHERE class_id=?',(cl['id'],));c.execute('INSERT INTO lessons VALUES(?,?,?,1)',(secrets.token_hex(12),cl['id'],now));return self.reply({'ok':True})
    if path in ['/api/attendance','/api/close'] and method=='POST':
     l=c.execute('SELECT l.*,c.teacher FROM lessons l JOIN classes c ON c.id=l.class_id WHERE l.id=?',(d.get('lesson'),)).fetchone()
     if not l:return self.reply({'error':'Session not found'},404)
     owner=teacher and l['teacher']==uid
     if path=='/api/close':
      if not owner:return self.reply({'error':'Forbidden'},403)
      c.execute('UPDATE lessons SET active=0 WHERE id=?',(l['id'],));return self.reply({'ok':True})
     student=d.get('student') if owner else uid
     if not c.execute('SELECT 1 FROM members WHERE class_id=? AND student=?',(l['class_id'],student)).fetchone() or (not owner and (teacher or not l['active'])):return self.reply({'error':'Not permitted'},403)
     status=d.get('status') if owner else 'pending'
     if status not in ['present','late','absent','pending']:return self.reply({'error':'Invalid status'},400)
     if not owner and c.execute('SELECT 1 FROM attendance WHERE lesson=? AND student=?',(l['id'],student)).fetchone():return self.reply({'error':'Already checked in'},409)
     c.execute('INSERT INTO attendance VALUES(?,?,?) ON CONFLICT(lesson,student) DO UPDATE SET status=excluded.status',(l['id'],student,status));return self.reply({'ok':True})
    self.reply({'error':'Not permitted'},403)
  except sqlite3.IntegrityError:self.reply({'error':'Email already registered'},409)
  except (ValueError,TypeError,KeyError):self.reply({'error':'Invalid request'},400)
  except Exception:self.reply({'error':'Server error'},500)
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT',8000))),Handler).serve_forever()
