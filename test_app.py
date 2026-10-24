import os,tempfile,unittest,threading,json,urllib.request,urllib.error,http.cookiejar
os.environ['DATABASE_PATH']=tempfile.mktemp(suffix='.db')
from server import Handler,ThreadingHTTPServer
class AttendanceTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.url='http://127.0.0.1:'+str(cls.server.server_port)
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();os.remove(os.environ['DATABASE_PATH'])
 def client(self):return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def req(self,client,path,data=None):
  req=urllib.request.Request(self.url+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
  try:
   with client.open(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def test_complete_workflow_and_access_control(self):
  t,s,other,anon=[self.client() for _ in range(4)]
  for client,name,role in [(t,'Professor','teacher'),(s,'Student','student'),(other,'Other','teacher')]:self.assertEqual(self.req(client,'register',dict(name=name,email=name+'@test.edu',role=role,password='test-password-123'))[0],200)
  self.assertEqual(self.req(anon,'state')[0],401)
  self.assertEqual(self.req(s,'classes',{'name':'Forbidden'})[0],403)
  self.assertEqual(self.req(t,'classes',{'name':'AI','section':'A'})[0],200)
  cl=self.req(t,'state')[1]['classes'][0]
  self.assertEqual(self.req(s,'join',{'code':cl['code']})[0],200)
  self.assertEqual(self.req(other,'lessons',{'classId':cl['id']})[0],404)
  self.req(t,'lessons',{'classId':cl['id']});l=self.req(t,'state')[1]['classes'][0]['lessons'][0]['id'];sid=self.req(s,'state')[1]['user']['id']
  self.assertEqual(self.req(s,'attendance',{'lesson':l,'status':'present'})[0],200)
  self.assertEqual(self.req(s,'state')[1]['classes'][0]['attendance'][0]['status'],'pending')
  self.assertEqual(self.req(s,'attendance',{'lesson':l})[0],409)
  self.assertEqual(self.req(other,'attendance',{'lesson':l,'student':sid,'status':'present'})[0],403)
  self.assertEqual(self.req(t,'attendance',{'lesson':l,'student':sid,'status':'present'})[0],200)
  self.assertEqual(self.req(s,'state')[1]['classes'][0]['attendance'][0]['status'],'present')
  self.req(t,'close',{'lesson':l});self.assertEqual(self.req(s,'attendance',{'lesson':l})[0],403)
  self.req(s,'logout',{});self.assertEqual(self.req(s,'state')[0],401)
  self.assertEqual(self.req(s,'login',{'email':'Student@test.edu','password':'incorrect'})[0],401)
if __name__=='__main__':unittest.main()
