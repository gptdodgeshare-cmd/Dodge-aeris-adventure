"""Shared true skeletal rig and in-place draft animation for the reference avatars.
Run inside Blender 4.3; imported by build_character_models.py.
"""
import bpy
import math
from mathutils import Vector

JOINTS = {
    'Root': ((0,0,0),(0,0,.22),None),
    'Pelvis': ((0,0,1.30),(0,0,1.48),'Root'),
    'Spine': ((0,0,1.48),(0,0,1.68),'Pelvis'),
    'Chest': ((0,0,1.68),(0,0,1.94),'Spine'),
    'Neck': ((0,0,1.94),(0,0,2.20),'Chest'),
    'Head': ((0,0,2.20),(0,0,2.95),'Neck'),
}
for side, sign in [('L',1),('R',-1)]:
    JOINTS.update({
        f'UpperArm_{side}': ((sign*.43,0,1.90),(sign*.63,0,1.53),'Chest'),
        f'Forearm_{side}': ((sign*.63,0,1.53),(sign*.69,0,1.18),f'UpperArm_{side}'),
        f'Hand_{side}': ((sign*.69,0,1.18),(sign*.70,-.015,1.02),f'Forearm_{side}'),
        f'Thigh_{side}': ((sign*.20,0,1.30),(sign*.20,0,.72),'Pelvis'),
        f'Shin_{side}': ((sign*.20,0,.72),(sign*.20,0,.16),f'Thigh_{side}'),
        f'Foot_{side}': ((sign*.20,0,.16),(sign*.20,-.25,.08),f'Shin_{side}'),
    })
JOINTS['MainWeapon_RightHand'] = ((-.70,-.015,1.07),(-.70,-.13,1.07),'Hand_R')
JOINTS['Offhand_LeftHand'] = ((.70,-.015,1.07),(.70,-.13,1.07),'Hand_L')


def _smooth(value):
    value = min(1.0,max(0.0,value))
    return value*value*(3-2*value)


def create_rig(name):
    data=bpy.data.armatures.new(name+'_Skeleton')
    arm=bpy.data.objects.new(name+'_Rig',data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name,(head,tail,parent) in JOINTS.items():
        bone=data.edit_bones.new(bone_name)
        bone.head=head;bone.tail=tail
        if parent: bone.parent=data.edit_bones[parent]
        bone.use_connect=False
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in arm.pose.bones:
        bone.rotation_mode='XYZ'
    arm['rig_version']='DodgeSharedBodyV1'
    arm['forward']='Blender -Y / glTF +Z'
    arm['body_height']=3.0
    arm['draft']=True
    arm.show_in_front=True
    arm.select_set(False)
    return arm


def _vertex_weights(obj,vertex):
    fixed=obj.get('rig_bone')
    if fixed in JOINTS: return {fixed:1.0}
    region=obj.get('rig_region','body')
    p=obj.matrix_world@vertex.co;z=p.z
    if region.startswith('arm_'):
        side=region[-1]
        if z<1.27:
            t=_smooth((z-1.13)/.14)
            return {f'Hand_{side}':1-t,f'Forearm_{side}':t}
        t=_smooth((z-1.39)/.28)
        return {f'Forearm_{side}':1-t,f'UpperArm_{side}':t}
    if region.startswith('leg_'):
        side=region[-1]
        if z<.26:
            t=_smooth((z-.12)/.14)
            return {f'Foot_{side}':1-t,f'Shin_{side}':t}
        t=_smooth((z-.60)/.24)
        return {f'Shin_{side}':1-t,f'Thigh_{side}':t}
    if region=='pants':
        side='L' if p.x>=0 else 'R'
        t=_smooth((z-1.12)/.22)
        return {f'Thigh_{side}':1-t,'Pelvis':t}
    points=[(1.34,'Pelvis'),(1.56,'Spine'),(1.82,'Chest'),(2.08,'Neck')]
    if z<=points[0][0]: return {'Pelvis':1.0}
    for (a,an),(b,bn) in zip(points,points[1:]):
        if z<=b:
            t=_smooth((z-a)/(b-a));return {an:1-t,bn:t}
    return {'Neck':1.0}


def bind_objects(objects,arm):
    for obj in objects:
        if obj.type!='MESH':continue
        groups={name:obj.vertex_groups.new(name=name) for name in JOINTS}
        for vertex in obj.data.vertices:
            weights=_vertex_weights(obj,vertex)
            for name,weight in weights.items():
                if weight>.000001:groups[name].add([vertex.index],weight,'REPLACE')
        modifier=obj.modifiers.new('SharedSkeleton','ARMATURE');modifier.object=arm
        modifier.use_deform_preserve_volume=True
        obj.parent=arm
        obj.matrix_parent_inverse=arm.matrix_world.inverted()
        obj['skinned']=True
        for poly in obj.data.polygons:poly.use_smooth=True


def _pose(arm):
    for bone in arm.pose.bones:
        bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)


def _clip_pose(arm,clip,phase):
    p=arm.pose.bones
    wave=math.sin(phase*math.tau)
    if clip=='Idle':
        p['Chest'].rotation_euler.x=.009*wave
        p['Head'].rotation_euler.y=.014*math.sin(phase*math.tau)
        p['UpperArm_L'].rotation_euler.x=.014*wave
        p['UpperArm_R'].rotation_euler.x=-.014*wave
    elif clip in ('Walk','Run'):
        run=clip=='Run';amp=.72 if run else .44
        p['Chest'].rotation_euler.x=.12 if run else .035
        p['Spine'].rotation_euler.z=.045*wave
        for side,sign in [('L',1),('R',-1)]:
            w=wave*sign
            p[f'Thigh_{side}'].rotation_euler.x=amp*w
            p[f'Shin_{side}'].rotation_euler.x=-max(0,-w)*(.95 if run else .6)
            p[f'Foot_{side}'].rotation_euler.x=-.16*w
            p[f'UpperArm_{side}'].rotation_euler.x=-amp*w
            p[f'Forearm_{side}'].rotation_euler.x=-.30 if run else -.10
    elif clip=='Attack':
        swing=math.sin(math.pi*min(1,phase))
        p['Chest'].rotation_euler.z=-.2*swing
        p['UpperArm_R'].rotation_euler.x=-1.55*swing
        p['UpperArm_R'].rotation_euler.z=-.22*swing
        p['Forearm_R'].rotation_euler.x=-.6*swing
        p['UpperArm_L'].rotation_euler.x=.25*swing
    elif clip=='Hit':
        hit=math.sin(math.pi*phase)
        p['Spine'].rotation_euler.x=-.2*hit
        p['Head'].rotation_euler.x=-.12*hit
        p['UpperArm_L'].rotation_euler.z=-.17*hit
        p['UpperArm_R'].rotation_euler.z=.17*hit
    elif clip=='Death':
        fall=_smooth(min(1,phase/.85))
        p['Root'].rotation_euler.x=1.50*fall
        p['UpperArm_L'].rotation_euler.x=-.45*fall
        p['UpperArm_R'].rotation_euler.x=-.45*fall
        p['Forearm_L'].rotation_euler.x=-.25*fall
        p['Forearm_R'].rotation_euler.x=-.25*fall
        p['Head'].rotation_euler.x=-.10*fall


def _ground_offset(arm,meshes,clip):
    # Evaluate the skinned soles (whole body on Death), then key a vertical-only
    # skeletal adjustment. The actor/world root never travels horizontally.
    feet=[o for o in meshes if o.get('rig_bone') in ('Foot_L','Foot_R')]
    check=meshes if clip=='Death' else feet
    if not check:return 0.0
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    low=1000.0
    for obj in check:
        evaluated=obj.evaluated_get(deps)
        low=min(low,*( (evaluated.matrix_world@Vector(corner)).z for corner in evaluated.bound_box ))
    # Keep the low point on the floor, but do not lower resting sole outlines.
    return -low if abs(low)>.00002 else 0.0


def build_animations(arm,meshes):
    arm.animation_data_create()
    result=[]
    for clip,duration in [('Idle',2.0),('Walk',1.0),('Run',.666667),('Attack',.833333),('Hit',.5),('Death',1.333333)]:
        action=bpy.data.actions.new(clip)
        action.use_fake_user=True
        arm.animation_data.action=action
        end=round(duration*24)
        for frame in sorted(set([0,end]+list(range(0,end+1,2)))):
            bpy.context.scene.frame_set(frame)
            _pose(arm);_clip_pose(arm,clip,frame/end)
            if clip in ('Walk','Run','Death'):
                arm.pose.bones['Root'].location.y=_ground_offset(arm,meshes,clip)
            for name in JOINTS:
                bone=arm.pose.bones[name]
                bone.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
                if name=='Root':bone.keyframe_insert(data_path='location',frame=frame,group=name)
        for fcurve in action.fcurves:
            for key in fcurve.keyframe_points:key.interpolation='LINEAR'
        track=arm.animation_data.nla_tracks.new();track.name=clip
        strip=track.strips.new(clip,0,action);strip.name=clip;strip.extrapolation='NOTHING'
        track.mute=True
        result.append(action)
    arm.animation_data.action=None
    _pose(arm);bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    arm['animation_clips']=[a.name for a in result]
    return result


def apply_rig(meshes,name):
    arm=create_rig(name)
    bind_objects(meshes,arm)
    build_animations(arm,meshes)
    return arm
