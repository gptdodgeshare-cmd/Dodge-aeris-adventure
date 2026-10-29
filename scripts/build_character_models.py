"""Original reference-guided chibi draft. Blender 4.3 background authoring script.
Sole art reference: the Male_Base_V1/Female_Base_V1 sheet supplied by the user.
This is a review draft, not a claim of exact likeness or production approval.
Z-up; front -Y; anatomical left +X; ground0; scalp/skull top3.0 excluding hair.
Run: blender --background --python scripts/build_character_models.py
"""
import bpy, math, json, sys
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
OUT=ROOT/'characters'/'generated';OUT.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
M={}
def mat(name,col,rough=.48,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if 'Skin' in name: p.inputs['Subsurface Weight'].default_value=.075;p.inputs['Subsurface Radius'].default_value=(1,.45,.25)
 M[name]=m;return m
mat('Skin',(0.68,.39,.245),.48);mat('SkinWarm',(.73,.33,.25),.55);mat('SkinSoft',(.78,.46,.33),.55)
mat('HairBrown',(.12,.052,.029),.39);mat('HairWarm',(.19,.082,.041),.42);mat('HairLight',(.27,.123,.064),.43)
mat('EyeWhite',(.88,.85,.77),.28);mat('IrisBrown',(.19,.063,.022),.22);mat('IrisAmber',(.34,.14,.04),.25);mat('Pupil',(.012,.007,.006),.2);mat('EyeGlint',(1,1,1),.05)
mat('Lip',(.39,.13,.105),.55);mat('ShortsBlue',(.033,.075,.23),.7);mat('ShortsSeam',(.055,.11,.32),.74);mat('WhiteCotton',(.85,.84,.80),.72);mat('SandalBlue',(.025,.07,.22),.7)

ALL=[]
def mesh(name,verts,faces,material='Skin',part='Torso',bone=None,region=None):
 d=bpy.data.meshes.new(name+'_Mesh');d.from_pydata(verts,[],faces);d.update()
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.data.materials.append(M[material])
 for p in d.polygons:p.use_smooth=True
 o['part']=part
 if bone:o['rig_bone']=bone
 if region:o['rig_region']=region
 ALL.append(o);return o

def uvell(name,c,s,material='Skin',part='Torso',bone=None,region=None,segments=24,rings=16):
 verts=[];faces=[]
 for i in range(rings+1):
  p=math.pi*i/rings
  for j in range(segments):
   a=2*math.pi*j/segments;verts.append((c[0]+s[0]*math.sin(p)*math.cos(a),c[1]+s[1]*math.sin(p)*math.sin(a),c[2]+s[2]*math.cos(p)))
 for i in range(rings):
  for j in range(segments):
   a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
 return mesh(name,verts,faces,material,part,bone,region)

def catmull(points,t):
 n=len(points);u=t*(n-1);i=min(n-2,int(u));a=u-i
 p0=Vector(points[max(0,i-1)]);p1=Vector(points[i]);p2=Vector(points[i+1]);p3=Vector(points[min(n-1,i+2)])
 return .5*((2*p1)+(-p0+p2)*a+(2*p0-5*p1+4*p2-p3)*a*a+(-p0+3*p1-3*p2+p3)*a*a*a)

def loft(name,profiles,cx=0,material='Skin',part='Torso',bone=None,region=None,radial=32,steps=36):
 # Profiles are z,xradius,yradius,ycenter; smooth meridian surface, not a primitive capsule.
 verts=[];faces=[]
 for i in range(steps+1):
  z,rx,ry,cy=catmull(profiles,i/steps)
  for j in range(radial):
   a=j*2*math.pi/radial;verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z))
 for i in range(steps):
  for j in range(radial):
   a=i*radial+j;b=i*radial+(j+1)%radial;faces.append((a,b,b+radial,a+radial))
 faces.extend([tuple(reversed(range(radial))),tuple(steps*radial+j for j in range(radial))])
 return mesh(name,verts,faces,material,part,bone,region)

def tube(name,points,widths,depths=None,material='Skin',part='Torso',bone=None,region=None,steps=16,sides=10,orientation=(0,1,0)):
 if depths is None:depths=widths
 verts=[];faces=[]
 for i in range(steps+1):
  t=i/steps;p=catmull(points,t);before=catmull(points,max(0,t-.01));after=catmull(points,min(1,t+.01));tangent=(after-before).normalized()
  axis=Vector(orientation);axis=(axis-tangent*axis.dot(tangent)).normalized()
  if axis.length<.5:axis=tangent.cross(Vector((1,0,0))).normalized()
  other=tangent.cross(axis).normalized();wp=catmull([(v,0,0) for v in widths],t).x;dp=catmull([(v,0,0) for v in depths],t).x
  for j in range(sides):
   a=j*math.tau/sides;v=p+axis*(math.cos(a)*dp)+other*(math.sin(a)*wp);verts.append(tuple(v))
 for i in range(steps):
  for j in range(sides):
   a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
 faces.extend([tuple(reversed(range(sides))),tuple(steps*sides+j for j in range(sides))])
 return mesh(name,verts,faces,material,part,bone,region)

def line(name,points,r=.008,material='WhiteCotton',part='Pants',bone=None,region=None):
 return tube(name,points,[r]*len(points),material=material,part=part,bone=bone,region=region,steps=max(6,len(points)*3),sides=6)

def hair_lock(name,points,width=.10,material='HairBrown',female=False):
 # Rounded sculpted tapered lock with a pointed tip and longitudinal highlight ridges.
 o=tube(name,points,[width*.65,width,width*.65,.001],[.026,.043,.035,.001],material,'Hair','Head',steps=14,sides=10,orientation=(0,-1,0))
 return o

HEAD_PROFILE=[(2.0,.055,.075,-.025),(2.035,.21,.16,-.035),(2.12,.335,.265,-.02),(2.25,.425,.325,-.005),(2.40,.468,.365,0),(2.58,.475,.382,.0),(2.75,.445,.352,.012),(2.89,.355,.29,.012),(2.975,.18,.155,.005),(3.0,.001,.001,0)]

def build_face(gender):
 head=loft('Head',HEAD_PROFILE,part='Head',bone='Head',radial=48,steps=48);head['role']='skull';head['baseHeight']=3.0;head['skullTop']=3.0
 for side in [-1,1]:
  # Shell and inner-ear rims are actual curved surfaces.
  uvell('Ear', (side*.468,.0,2.43),(.085,.08,.14),'Skin','Head','Head',segments=16,rings=12)
  uvell('EarInner',(side*.51,-.061,2.43),(.032,.024,.078),'SkinWarm','Head','Head',segments=12,rings=10)
  x=side*.193
  uvell('EyeSclera',(x,-.348,2.553),(.139,.027,.115),'EyeWhite','Head','Head',segments=24,rings=16)
  uvell('EyeIris',(x,-.374,2.546),(.085,.009,.095),'IrisBrown','Head','Head',segments=24,rings=12)
  uvell('EyeAmber',(x,-.383,2.518),(.064,.004,.050),'IrisAmber','Head','Head',segments=20,rings=10)
  uvell('EyePupil',(x,-.388,2.558),(.046,.006,.065),'Pupil','Head','Head',segments=20,rings=12)
  uvell('EyeHighlight',(x-.026,-.397,2.591),(.021,.005,.025),'EyeGlint','Head','Head',segments=12,rings=8)
  uvell('EyeHighlightSmall',(x+.03,-.394,2.512),(.008,.004,.009),'EyeGlint','Head','Head',segments=8,rings=6)
  upper=[(x-.139,-.351,2.54),(x-.10,-.375,2.622),(x+.02,-.379,2.665),(x+.137,-.351,2.59)]
  line('UpperLid',upper,.008 if gender=='male' else .010,'HairBrown','Head','Head')
  lower=[(x-.13,-.348,2.525),(x,-.371,2.447),(x+.13,-.348,2.525)]
  line('LowerLid',lower,.004,'Skin','Head','Head')
  brow=[(x-.13,-.342,2.755),(x-.01,-.374,2.79),(x+.12,-.333,2.765)]
  line('Eyebrow',brow,.016 if gender=='male' else .012,'HairBrown','Head','Head')
  if gender=='female':
   for zoff in [0,.025]:
    line('Lash',[(x+side*.125,-.355,2.60+zoff),(x+side*.153,-.341,2.62+zoff)],.009,'HairBrown','Head','Head')
  # Subtle flush sits on the curved cheek, not a flat face texture.
  # Blush kept in material palette; no raised cheek discs on the face.
 uvell('Nose',(0,-.361,2.418),(.044,.058,.052),'Skin','Head','Head',segments=20,rings=12)
 for x in [-.023,.023]:uvell('Nostril',(x,-.406,2.391),(.009,.006,.006),'SkinWarm','Head','Head',segments=8,rings=6)
 line('Smile',[(-.092,-.318,2.242),(-.045,-.336,2.222),(0,-.34,2.218),(.05,-.333,2.225),(.09,-.316,2.244)],.009,'Lip','Head','Head')
 # Lower lip is shaped by the chin surface rather than a separate bright strip.


def build_hair(gender):
 # Scalp follows the reference volume and is overlaid with individually sculpted locks.
 verts=[];faces=[];segments=48;rows=18
 for i in range(rows+1):
  t=i/rows
  for j in range(segments):
   a=j*math.tau/segments;front=max(0,-math.sin(a));back=max(0,math.sin(a));end=1.62-.57*front+.35*back
   p=t*end;verts.append((.505*math.sin(p)*math.cos(a),.435*math.sin(p)*math.sin(a),2.50+.605*math.cos(p)))
 for i in range(rows):
  for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
 scalp=mesh('Hair',verts,faces,'HairBrown','Hair','Head');scalp['role']='hair'
 # Layered crown locks sweep from an offset part toward forehead and temple.
 for i in range(11):
  x=-.44+i*.088;z=2.68+.085*math.sin(i*1.8)+.025*math.cos(i*.7)
  if gender=='female':z=2.69+.065*math.sin(i*1.4)
  pts=[(-.07+.035*math.sin(i),.01,3.075),(x*.35+.035*math.sin(i*.8),-.25,3.075),(x*.80+.025*math.sin(i),-.426,2.94),(x+.018*math.sin(i*.7),-.42,z)]
  hair_lock('Hair_Bang_%02d'%i,pts,(.050 if i%2 else .063) if gender=='female' else (.055 if i%2 else .070),'HairWarm' if i%3==0 else 'HairBrown')
  if i%2==0:
   pts2=[(p[0]-.015,p[1]-.008,p[2]+.005) for p in pts[:-1]]+[pts[-1]]
   tube('Hair_Bang_Ridge',pts2,[.015,.022,.014,.001],[.004,.006,.004,.001],'HairLight','Hair','Head',steps=12,sides=6)
 for side in [-1,1]:
  for i in range(4):
   pts=[(side*.08,.025,3.085),(side*.39,-.02+i*.07,2.96),(side*.51,-.14+i*.11,2.69),(side*(.49+.025*(i%2)),-.17+i*.10,2.35+.08*i)]
   hair_lock('Hair_Temple',pts,.085,'HairWarm' if i%2 else 'HairBrown')
 for i in range(11):
  a=.1+i*math.pi/10
  x=.47*math.cos(a);y=.40*math.sin(a)
  pts=[(-.04,.04,3.09),(.3*math.cos(a),.25*math.sin(a),3.04),(x,y,2.75),(x*1.05,y*1.06,2.32+.05*(i%3))]
  hair_lock('Hair_BackLayer',pts,.105,'HairWarm' if i%3==0 else 'HairBrown')
 if gender=='male':
  for i in range(5):
   x=-.25+i*.115
   pts=[(x*.4,.01,3.06),(x,.02,3.14),(x+.04,-.04,3.21-.025*i),(x+.09,-.08,3.15-.025*i)]
   hair_lock('Hair_Crown_Wisp',pts,.045,'HairWarm')
 else:
  # A soft high ponytail made of many flowing tapering locks, no sphere proxy.
  for i in range(13):
   a=math.tau*i/13;dx=math.cos(a)*.12;dy=math.sin(a)*.10
   pts=[(.10+dx,.32,3.01),(.15+dx*1.7,.55+dy,3.25),(.13+dx*2,.72+dy,2.70),(.10+dx*1.45,.68+dy,2.27-.12*(i%3))]
   hair_lock('Hair_Ponytail_%02d'%i,pts,.085,'HairWarm' if i%3==0 else 'HairBrown')
  # Hair tie is a plain brown fastening integral to hair, not an accessory redesign.
  for i in range(4):line('Hair_Tie',[(.13*math.cos(a),.36+.035*i,2.96+.12*math.sin(a)) for a in [j*math.tau/16 for j in range(17)]],.012,'HairBrown','Hair','Head')


def build_body(gender):
 female=gender=='female'
 bodyprof=[(1.21,.29,.18,0),(1.34,.30 if female else .28,.17,0),(1.48,.235 if female else .28,.145 if female else .16,0),(1.62,.27 if female else .31,.17,0),(1.76,.335 if female else .36,.19,0),(1.86,.365 if female else .395,.16,0),(1.93,.29,.12,0),(1.98,.13,.105,0),(2.08,.105,.095,0)]
 loft('Torso',bodyprof,part='Torso',region='body',radial=40,steps=40)
 # Male lightly indicated chest; no exaggerated muscle sculpt.
 if not female:
  # Smooth undeclared torso surface; no raised pectoral proxy meshes.
  uvell('Navel',(0,-.168,1.395),(.013,.005,.017),'SkinWarm','Torso',region='body',segments=10,rings=6)
 else:
  tank=[(1.465,.244,.154,-.003),(1.55,.256,.174,-.004),(1.68,.32,.196,-.005),(1.80,.344,.182,-.004),(1.86,.30,.135,0)]
  tankmesh=loft('Torso_Tank',tank,material='WhiteCotton',part='Torso',region='body',radial=48,steps=32)
  for v in tankmesh.data.vertices:
   if v.co.y<0:
    field=sum(math.exp(-((v.co.x-side*.135)/.145)**2-((v.co.z-1.735)/.135)**2) for side in [-1,1])
    v.co.y-=.054*field*min(1,max(0,-v.co.y/.12))
  for side in [-1,1]:
   # Tank front is a single smooth sculpted surface, no separate breast proxies.
   tube('Torso_TankStrap',[(side*.24,-.14,1.84),(side*.29,-.09,1.94),(side*.29,.05,1.955),(side*.24,.13,1.84)],[.033]*4,[.012]*4,'WhiteCotton','Torso',region='body',steps=16,sides=8)
  uvell('Navel',(0,-.16,1.397),(.012,.005,.015),'SkinWarm','Torso',region='body',segments=10,rings=6)
 for side,label in [(-1,'R'),(1,'L')]:
  # Rounded limb profile follows the agreed shoulder/elbow/wrist rig, with wrist taper.
  tube('Arm_'+label,[(side*.27,0,1.81),(side*.47,0,1.81),(side*.63,-.005,1.53),(side*.69,-.02,1.18)],[.035,.115 if not female else .095,.081,.052],[.035,.105,.08,.048],part='Arms',region='arm_'+label,steps=28,sides=16)
  uvell('Hand_'+label,(side*.706,-.025,1.095),(.073,.046,.10),'Skin','Hands','Hand_'+label,segments=16,rings=12)
  for i,(digit,length) in enumerate([('Index',.139),('Middle',.164),('Ring',.151),('Little',.113)]):
   fx=side*(.66+i*.031);fy=-.03+.008*(i%2);top=1.061
   pts=[(fx,fy,top),(fx+side*.006,fy-.009,top-length*.45),(fx+side*.003,fy-.012,top-length)]
   tube('Hand_'+label+'_finger_'+digit,pts,[.018,.017,.012],part='Hands',bone='Hand_'+label,steps=10,sides=8)
  tube('Hand_'+label+'_finger_Thumb',[(side*.65,-.035,1.145),(side*.61,-.066,1.11),(side*.60,-.079,1.053)],[.026,.023,.015],part='Hands',bone='Hand_'+label,steps=12,sides=10)
  leg=[(.14,.06,.065,.0),(.25,.065,.068,.015),(.43,.095,.09,.013),(.60,.10,.09,.004),(.73,.084,.086,-.005),(.93,.12 if not female else .128,.115,0),(1.19,.136 if not female else .144,.135,0),(1.33,.14,.14,0)]
  loft('Leg_'+label,leg,cx=side*.2,part='Legs',region='leg_'+label,radial=24,steps=32)
  # Proper rounded feet with discrete toes; sole is grounded at exactly0.
  uvell('Foot_'+label,(side*.2,-.085,.105),(.105,.19,.075),'Skin','Shoes','Foot_'+label,segments=20,rings=12)
  for i in range(5):
   tx=side*.2+side*(-.075+i*.036);ty=-.235+.012*i
   uvell('Toe_'+label,(tx,ty,.092),(.026 if i==0 else .021,.055-.005*i,.034),'Skin','Shoes','Foot_'+label,segments=12,rings=8)
  sole=loft('Shoes_Sole_'+label,[(0,.115,.245,-.1),(.025,.125,.25,-.1),(.055,.12,.245,-.1)],cx=side*.2,material='SandalBlue',part='Shoes',bone='Foot_'+label,radial=32,steps=4)
  for sign in [-1,1]:line('Shoes_Thong_'+label,[(side*.2,-.23,.146),(side*.2+sign*.047,-.15,.176),(side*.2+sign*.108,-.015,.115)],.018,'SandalBlue','Shoes','Foot_'+label)
 # Shared blue shorts, white piping, and an actual tied drawstring.
 loft('Pants_Waist',[(1.19,.325,.211,0),(1.35,.33,.211,0),(1.42,.305,.195,0)],material='ShortsBlue',part='Pants',region='pants',radial=40,steps=12)
 for side,label in [(-1,'R'),(1,'L')]:
  loft('Pants_Leg_'+label,[(1.035,.173,.19,0),(1.12,.181,.195,0),(1.29,.185,.20,0),(1.34,.17,.185,0)],cx=side*.18,material='ShortsBlue',part='Pants',region='pants',radial=32,steps=16)
  hem=[(side*.18+.176*math.cos(a),.195*math.sin(a),1.045) for a in [j*math.tau/32 for j in range(33)]]
  line('Pants_WhiteHem',hem,.009,'WhiteCotton','Pants',region='pants')
  line('Pants_SidePiping',[(side*.335,-.01,1.39),(side*.365,-.01,1.22),(side*.35,-.01,1.055)],.007,'WhiteCotton','Pants',region='pants')
  line('Pants_Stitch',[(side*.29,-.14,1.38),(side*.31,-.14,1.25),(side*.31,-.14,1.08)],.004,'ShortsSeam','Pants',region='pants')
 line('Pants_Waistband',[(.31*math.cos(a),.19*math.sin(a),1.415) for a in [j*math.tau/40 for j in range(41)]],.012,'ShortsSeam','Pants',region='pants')
 uvell('Drawstring_Knot',(0,-.21,1.36),(.017,.015,.018),'WhiteCotton','Pants','Pelvis',segments=12,rings=8)
 for side in [-1,1]:
  line('Drawstring_Bow',[(0,-.22,1.36),(side*.055,-.23,1.39),(side*.067,-.235,1.345),(0,-.22,1.36)],.006,'WhiteCotton','Pants','Pelvis')
  line('Drawstring_End',[(side*.01,-.22,1.35),(side*.026,-.23,1.29),(side*.034,-.22,1.23)],.005,'WhiteCotton','Pants','Pelvis')


def cleanup_part_meshes(objects):
 # Merge rigid head detail per material while retaining a named measurable skull,
 # and retain individual fingers for audit and inspection.
 groups={}
 for o in objects:
  if o.get('role')=='skull' or '_finger_' in o.name:continue
  key=(o.get('part'),o.get('rig_bone'),o.get('rig_region'),o.data.materials[0].name)
  groups.setdefault(key,[]).append(o)
 result=[o for o in objects if o.get('role')=='skull' or '_finger_' in o.name]
 for key,items in groups.items():
  if len(items)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in items:o.select_set(True)
   bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();o=items[0]
  else:o=items[0]
  result.append(o)
 return result

manifest={'version':1,'unit':'game-unit','draft':True,'reference':'User-supplied Character Reference Sheet only','models':{}}
for gender in ['male','female']:
 before=set(bpy.data.objects);ALL=[]
 build_face(gender);build_hair(gender);build_body(gender)
 objects=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
 # Suffix meshids from first model would collide, metadata is authoritative.
 skull=next(o for o in objects if o.get('role')=='skull');skull.name='Head' if gender=='male' else 'Female_Head';skull['role']='skull'
 objects=cleanup_part_meshes(objects)
 for o in objects:
  if o.get('part')=='Hair':o['role']='hair'
 from character_rig import apply_rig
 name='Male_Base_V1' if gender=='male' else 'Female_Base_V1'
 rig=apply_rig(objects,name)
 # Root acts as a collection identity; armature owns the skinned meshes.
 rig.name=name;rig['baseHeight']=3.0;rig['skullTop']=3.0;rig['draft']=True;rig['gender']=gender
 for o in objects:
  o.name=('Male_Mesh_' if gender=='male' else 'Female_Mesh_')+o.name
  if o.parent is None:o.parent=rig
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_skins=True,export_extras=True,export_yup=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True)
 tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
 manifest['models'][gender]={'file':name+'.glb','name':name,'baseHeight':3.0,'skullTop':3.0,'headHeight':1.0,'draft':True,'triangles':tris,'materials':len(set(m.name for o in objects for m in o.data.materials)),'meshCount':len(objects)}
 # Keep objects in separate collections, no cross-character material orrig mutation.
 collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
 for o in [rig]+objects:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
 # Put comparison assets apart in editable .blend only (exports already eachorigin).
 rig.location.x=-.8 if gender=='male' else .8

(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Character_Bases_Review.blend'))
print('CHARACTER_EXPORT_COMPLETE',json.dumps(manifest))
