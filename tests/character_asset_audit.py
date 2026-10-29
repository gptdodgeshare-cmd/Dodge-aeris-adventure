"""Inspect the actual GLB buffers, bind pose and skeletal animation; no deps.
Run: python3 tests/character_asset_audit.py
This is a structural gate, not an assertion of artistic likeness to the sheet.
"""
import json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REQUIRED=['Root','Pelvis','Spine','Chest','Neck','Head']+[f'{b}_{s}' for s in ['L','R'] for b in ['UpperArm','Forearm','Hand','Thigh','Shin','Foot']]+['MainWeapon_RightHand','Offhand_LeftHand']
PARENTS={'Pelvis':'Root','Spine':'Pelvis','Chest':'Spine','Neck':'Chest','Head':'Neck','MainWeapon_RightHand':'Hand_R','Offhand_LeftHand':'Hand_L'}
for s in ['L','R']:
 PARENTS.update({f'UpperArm_{s}':'Chest',f'Forearm_{s}':f'UpperArm_{s}',f'Hand_{s}':f'Forearm_{s}',f'Thigh_{s}':'Pelvis',f'Shin_{s}':f'Thigh_{s}',f'Foot_{s}':f'Shin_{s}'})
I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def multiply(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def transform(m,p):return tuple(sum(m[c*4+r]*p[c] for c in range(3))+m[12+r] for r in range(3))
def matrix(n):
 if 'matrix'in n:return n['matrix']
 x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0])
 return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,*t,1]
class GLB:
 def __init__(self,path):
  self.path=path;data=path.read_bytes();assert data[:4]==b'glTF';version,size=struct.unpack_from('<II',data,4);assert version==2 and size==len(data)
  n,t=struct.unpack_from('<II',data,12);assert t==0x4E4F534A;self.doc=json.loads(data[20:20+n]);offset=20+n;bl,bt=struct.unpack_from('<II',data,offset);assert bt==0x004E4942;self.buffer=data[offset+8:offset+8+bl]
  self.parents={c:p for p,node in enumerate(self.doc['nodes']) for c in node.get('children',[])};self.worlds={}
 def world(self,i):
  if i not in self.worlds:self.worlds[i]=multiply(self.world(self.parents[i]) if i in self.parents else I,matrix(self.doc['nodes'][i]))
  return self.worlds[i]
 def values(self,i):
  a=self.doc['accessors'][i];assert 'sparse'not in a;v=self.doc['bufferViews'][a['bufferView']];formats={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'};components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};fmt='<'+formats[a['componentType']]*components[a['type']];size=struct.calcsize(fmt);stride=v.get('byteStride',size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
  result=[struct.unpack_from(fmt,self.buffer,offset+n*stride) for n in range(a['count'])]
  if a.get('normalized'):
   maximum={5120:127,5121:255,5122:32767,5123:65535}.get(a['componentType'],1);result=[tuple(max(-1,x/maximum) for x in row) for row in result]
  return result

def audit(path):
 g=GLB(path);d=g.doc;nodes=d['nodes'];assert len(d['skins'])==1;skin=d['skins'][0];bones={nodes[i]['name']:i for i in skin['joints']};assert set(REQUIRED).issubset(bones)
 for b,parent in PARENTS.items():assert g.parents[bones[b]]==bones[parent],(b,'incorrect parent')
 all_names=[n.get('name')for n in nodes];assert len(all_names)==len(set(all_names)),'Duplicate node names can break animation binding'
 tris=0;meshes=0;fingers=[];skull=[];body=[]
 for ni,node in enumerate(nodes):
  if 'mesh'not in node:continue
  meshes+=1;assert node.get('skin')==0,'Each body part must use the shared real skeleton'
  if '_finger_'in node.get('name',''):fingers.append(node['name'])
  extra=node.get('extras',{});hair=extra.get('role')=='hair'or extra.get('part')=='Hair';is_skull=extra.get('role')=='skull'
  for p in d['meshes'][node['mesh']]['primitives']:
   assert p.get('mode',4)==4;attrs=p['attributes'];assert all(k in attrs for k in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'])
   positions=g.values(attrs['POSITION']);weights=g.values(attrs['WEIGHTS_0']);joints=g.values(attrs['JOINTS_0']);assert len(positions)==len(weights)==len(joints)
   for ws,js in zip(weights,joints):assert abs(sum(ws)-1)<.0001 and all(math.isfinite(v)and v>=0 for v in ws) and max(js)<len(skin['joints'])
   pts=[transform(g.world(ni),p)for p in positions];assert all(math.isfinite(v)for p in pts for v in p)
   if not hair:body.extend(pts)
   if is_skull:skull.extend(pts)
   tris+=(d['accessors'][p['indices']]['count'] if 'indices'in p else len(positions))//3
   assert 'pbrMetallicRoughness'in d['materials'][p['material']]
 assert len(fingers)==10,'Ten individual finger meshes are required';assert skull and body
 foot=min(p[1]for p in body);top=max(p[1]for p in skull);head=top-min(p[1]for p in skull);height=top-foot
 assert abs(foot)<.0001 and abs(height-3)<.0001;assert .32<=head/height<=.36
 assert tris<65000 and path.stat().st_size<4*1024*1024
 clips={a['name']:a for a in d['animations']};assert set(clips)=={'Idle','Walk','Run','Attack','Hit','Death'}
 durations={};root_drift={}
 for name,a in clips.items():
  assert len(a['channels'])>=len(REQUIRED)
  animated=False
  for channel in a['channels']:
   sampler=a['samplers'][channel['sampler']];times=g.values(sampler['input']);values=g.values(sampler['output']);assert len(times)>1 and times[-1][0]>0;durations[name]=max(durations.get(name,0),times[-1][0]);animated|=any(any(abs(x-y)>.00001 for x,y in zip(v,values[0])) for v in values[1:])
   if channel['target']['node']==bones['Root']and channel['target']['path']=='translation':
    parent_world=g.world(g.parents[bones['Root']]);world=[transform(parent_world,v)for v in values];drift=max(max(p[i]for p in world)-min(p[i]for p in world)for i in [0,2]);assert drift<.0001,('root horizontal drift',name,drift);root_drift[name]=drift
  assert animated,(name,'static clip')
 return {'file':path.name,'bytes':path.stat().st_size,'height':height,'headHeight':head,'headRatio':head/height,'feetBottom':foot,'triangles':tris,'skinnedMeshes':meshes,'materials':len(d['materials']),'bones':list(bones),'jointPositions':{b:transform(g.world(i),(0,0,0))for b,i in bones.items()},'fingerNodes':fingers,'clips':durations,'rootHorizontalDrift':root_drift,'visualLikenessApproved':False}

def main():
 out={}
 for gender,name in [('male','Male_Base_V1'),('female','Female_Base_V1')]:
  out[gender]=audit(ROOT/'characters'/'generated'/(name+'.glb'));print('PASS',name,'height',out[gender]['height'],'triangles',out[gender]['triangles'],'bones',len(out[gender]['bones']))
 assert abs(out['male']['height']-out['female']['height'])<.0001
 for bone,p in out['male']['jointPositions'].items():assert max(abs(a-b)for a,b in zip(p,out['female']['jointPositions'][bone]))<.0001,(bone,'bind joint positions differ')
 result={'status':'passed','scope':'Structural asset gate; visual fidelity still requires user review','models':out};(ROOT/'characters'/'generated'/'asset-audit.json').write_text(json.dumps(result,indent=2));print('PASS equal skull height, shared bind joints, skin weights, PBR, 10 fingers, 20 bones and 6 animated clips')
if __name__=='__main__':main()
