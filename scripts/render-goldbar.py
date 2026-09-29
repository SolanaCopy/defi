# Renders public/gold-hero.webp source (RGBA PNG) headless:
#   blender -b --factory-startup -P scripts/render-goldbar.py -- out.png 1920 1200 96
# then convert to WebP. ~6 min on CPU.
import bpy, bmesh, math, sys, os
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]
W, H, SAMPLES = int(sys.argv[-3]), int(sys.argv[-2]), int(sys.argv[-1])

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.samples = SAMPLES
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = W, H
scn.render.film_transparent = True
scn.view_settings.view_transform = 'AgX'
scn.view_settings.look = 'AgX - Punchy'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = t; prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for d in prefs.devices: d.use = True
                scn.cycles.device = 'GPU'; break
        except Exception: pass
except Exception: pass

# ---------- materials ----------
def gold(name, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1.0, 0.60, 0.15, 1)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    # faint anisotropic brushing reads as cast metal rather than plastic
    if 'Anisotropic' in b.inputs: b.inputs['Anisotropic'].default_value = 0.35
    return m
g_body = gold('GoldBody', 0.11)
g_stamp = gold('GoldStamp', 0.55)

# ---------- ingot ----------
def ingot(name, L=2.2, Wd=1.0, Ht=0.42, taper=0.16):
    bm = bmesh.new()
    lb, wb = L / 2, Wd / 2
    lt, wt = lb - taper, wb - taper
    v = [bm.verts.new(p) for p in [(-lb,-wb,0),(lb,-wb,0),(lb,wb,0),(-lb,wb,0),
                                    (-lt,-wt,Ht),(lt,-wt,Ht),(lt,wt,Ht),(-lt,wt,Ht)]]
    for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        bm.faces.new([v[i] for i in f])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    bev = ob.modifiers.new('bev', 'BEVEL'); bev.width = 0.035; bev.segments = 5
    ob.data.materials.append(g_body)
    return ob, Ht, lt, wt

def stamp(parent, text, size, y, top):
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.object
    t.data.body = text; t.data.size = size; t.data.extrude = 0.018
    t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    for fp in ("C:/Windows/Fonts/timesbd.ttf", "C:/Windows/Fonts/georgiab.ttf"):
        if os.path.exists(fp): t.data.font = bpy.data.fonts.load(fp); break
    t.location = (0, y, top - 0.004)
    bpy.ops.object.convert(target='MESH')
    t.data.materials.clear(); t.data.materials.append(g_stamp)
    t.parent = parent
    return t

def make_bar(name, loc, rot_z, big=True):
    ob, Ht, lt, wt = ingot(name)
    stamp(ob, "SMART TRADING CLUB", 0.165, 0.17, Ht)
    stamp(ob, "FINE GOLD  999.9", 0.11, -0.06, Ht)
    stamp(ob, "1 KG  ·  XAU", 0.085, -0.25, Ht)
    ob.location = loc; ob.rotation_euler = (0, 0, rot_z)
    return ob

b1 = make_bar('Bar1', (0.35, -0.55, 0.0), math.radians(-14))
b2 = make_bar('Bar2', (-1.0, 1.1, 0.0), math.radians(-14))
b3 = make_bar('Bar3', (-1.0, 1.1, 0.42), math.radians(-4))   # stacked on Bar2

# ---------- floor (shadow catcher) ----------
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.object; floor.is_shadow_catcher = True
floor.visible_glossy = False
# Bounce card: the tapered sides face slightly down, so they mirror the floor.
# A warm emitter just under it, seen only in reflections, lights them the way
# a white card does in a product shot.
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.02))
card = bpy.context.object
cm = bpy.data.materials.new('Card'); cm.use_nodes = True
cn = cm.node_tree.nodes; cn.remove(cn['Principled BSDF'])
em = cn.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.82, 0.55, 1); em.inputs['Strength'].default_value = 1.6
cm.node_tree.links.new(em.outputs[0], cn['Material Output'].inputs['Surface'])
card.data.materials.append(cm)
card.visible_camera = False; card.visible_diffuse = False; card.visible_shadow = False
card.visible_transmission = False; card.visible_volume_scatter = False

# ---------- light ----------
world = bpy.data.worlds.new('W'); scn.world = world; world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment')
hdr = os.path.join(os.path.dirname(bpy.app.binary_path), bpy.app.version_string[:3], 'datafiles', 'studiolights', 'world', 'studio.exr')
env.image = bpy.data.images.load(hdr)
bg = nt.nodes['Background']; bg.inputs['Strength'].default_value = 0.8
nt.links.new(env.outputs['Color'], bg.inputs['Color'])

def area(name, loc, energy, size, color, target=(0, 0, 0.3)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); bpy.context.collection.objects.link(o); o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
area('Key', (3.0, -2.5, 3.2), 1200, 1.2, (1.0, 0.93, 0.82))
area('Strip', (-0.5, -3.5, 1.4), 500, 0.6, (1.0, 0.95, 0.9))
area('Rim', (-4.0, 4.5, 2.2), 1400, 2.0, (1.0, 0.80, 0.55))
area('Top', (0.0, 0.0, 6.0), 400, 6.0, (1.0, 1.0, 1.0))
# big warm softbox behind the camera: the faces turned toward the viewer mirror it
area('Fill', (-2.5, -7.0, 3.8), 1500, 8.0, (1.0, 0.84, 0.6), target=(0, 0, 0.2))
area('Fill2', (6.5, -1.0, 3.0), 700, 5.0, (1.0, 0.88, 0.7), target=(0, 0, 0.2))

# ---------- camera ----------
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = 50
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new('Cam', cam_d); bpy.context.collection.objects.link(cam)
cam.location = (3.6, -5.6, 4.6)
tgt = Vector((-0.3, 0.25, 0.3))
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.focus_distance = (tgt - cam.location).length - 0.4
scn.camera = cam

scn.render.image_settings.file_format = 'PNG'
scn.render.image_settings.color_mode = 'RGBA'
scn.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("DEVICE", scn.cycles.device)
