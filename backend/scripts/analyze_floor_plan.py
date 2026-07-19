#!/usr/bin/env python3
"""
Floor Plan Analyzer v5 — Fast wall detection using directional morphological opening.
Hatching has lines in one direction; walls are perpendicular to hatching or isolated.
Strategy: Use directional kernels to remove hatching while preserving perpendicular walls.
"""
import json
import sys
from PIL import Image
import numpy as np
from scipy import ndimage

def analyze(image_path, factory_w, factory_d, output_path):
    img = Image.open(image_path).convert('L')
    arr = np.array(img)
    h, w = arr.shape
    scale_x = factory_w / w
    scale_y = factory_d / h
    HX, HZ = factory_w / 2, factory_d / 2

    binary = (arr < 140).astype(np.uint8)

    # Directional opening: removes lines parallel to kernel
    # Horizontal hatching removed by horizontal opening (erode+dilate with wide kernel)
    h_open = ndimage.binary_opening(binary, structure=np.ones((1, 15))).astype(np.uint8)
    # Vertical hatching removed by vertical opening
    v_open = ndimage.binary_opening(binary, structure=np.ones((15, 1))).astype(np.uint8)

    # A pixel is a "real wall" if it survives directional opening
    # Horizontal walls: survive horizontal opening (long horizontal run, not vertical hatching)
    # Vertical walls: survive vertical opening
    # But we also need to remove hatching from the other direction
    # So: h_walls = h_open minus features that are also in v_open (those are cross-hatching intersections)
    # Actually simpler: use a larger kernel for the hatching direction
    # Typical hatching line spacing: ~8-12px. Use kernel of 20px to bridge hatching gaps.

    # Detect horizontal structural lines (remove vertical hatching)
    h_struct = ndimage.binary_opening(binary, structure=np.ones((1, 25))).astype(np.uint8)
    # Detect vertical structural lines (remove horizontal hatching)
    v_struct = ndimage.binary_opening(binary, structure=np.ones((25, 1))).astype(np.uint8)

    # Combine: any pixel that's a structural line in either direction
    combined = np.maximum(h_struct, v_struct)

    # Extract horizontal wall segments from h_struct
    MIN_WALL_M = 1.5
    MIN_LEN_PX_H = int(MIN_WALL_M / scale_x)
    MIN_LEN_PX_V = int(MIN_WALL_M / scale_y)

    walls = []

    # Horizontal: scan rows for runs in h_struct
    for y in range(h):
        run_start = None
        for x in range(w):
            if h_struct[y, x]:
                if run_start is None:
                    run_start = x
            else:
                if run_start is not None and (x - run_start) >= MIN_LEN_PX_H:
                    xm1 = round(run_start * scale_x - HX, 2)
                    xm2 = round(x * scale_x - HX, 2)
                    zm = round(y * scale_y - HZ, 2)
                    length = round(xm2 - xm1, 2)
                    if length >= MIN_WALL_M:
                        walls.append({'x1': xm1, 'z1': zm, 'x2': xm2, 'z2': zm,
                                      'orientation': 'horizontal', 'length': length})
                run_start = None

    # Vertical: scan columns for runs in v_struct
    for x in range(w):
        run_start = None
        for y in range(h):
            if v_struct[y, x]:
                if run_start is None:
                    run_start = y
            else:
                if run_start is not None and (y - run_start) >= MIN_LEN_PX_V:
                    xm = round(x * scale_x - HX, 2)
                    zm1 = round(run_start * scale_y - HZ, 2)
                    zm2 = round(y * scale_y - HZ, 2)
                    length = round(zm2 - zm1, 2)
                    if length >= MIN_WALL_M:
                        walls.append({'x1': xm, 'z1': zm1, 'x2': xm, 'z2': zm2,
                                      'orientation': 'vertical', 'length': length})
                run_start = None

    # Merge nearby walls (including double-line pairs from wall rendering)
    walls = merge_walls(walls)
    walls = merge_double_lines(walls)

    # Room detection via light cleaning
    light = ndimage.binary_opening(binary, structure=np.ones((3, 3))).astype(np.uint8)
    room_mask = (light == 0).astype(np.uint8)
    labeled, n_rooms = ndimage.label(room_mask)

    rooms = []
    for rid in range(1, n_rooms + 1):
        ys, xs = np.where(labeled == rid)
        if len(ys) < 200:
            continue
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        rw = (x1 - x0) * scale_x
        rd = (y1 - y0) * scale_y
        if rw < 2.0 or rd < 2.0:
            continue
        # Skip the entire-factory background room
        if rw > factory_w * 0.8 and rd > factory_d * 0.8:
            continue
        rooms.append({
            'id': f'room_{len(rooms)+1}',
            'x1': round(x0 * scale_x - HX, 2), 'z1': round(y0 * scale_y - HZ, 2),
            'x2': round(x1 * scale_x - HX, 2), 'z2': round(y1 * scale_y - HZ, 2),
            'cx': round((x0 + x1) / 2 * scale_x - HX, 2),
            'cz': round((y0 + y1) / 2 * scale_y - HZ, 2),
            'width': round(rw, 2), 'depth': round(rd, 2), 'area': round(rw * rd, 2),
        })

    result = {
        'factory': {'width': factory_w, 'depth': factory_d, 'image_w': w, 'image_h': h},
        'walls': walls,
        'rooms': rooms,
        'wall_height': 3.0,
    }

    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    hc = len([w for w in walls if w['orientation'] == 'horizontal'])
    vc = len([w for w in walls if w['orientation'] == 'vertical'])
    print(f"Walls: {hc} H + {vc} V = {len(walls)} total")
    print(f"Rooms: {len(rooms)}")
    for r in sorted(rooms, key=lambda r: r['area'], reverse=True)[:8]:
        print(f"  {r['id']}: {r['width']}m x {r['depth']}m = {r['area']}m² at ({r['cx']}, {r['cz']})")


def merge_walls(walls):
    h = sorted([w for w in walls if w['orientation'] == 'horizontal'], key=lambda w: (round(w['z1'], 0), w['x1']))
    v = sorted([w for w in walls if w['orientation'] == 'vertical'], key=lambda w: (round(w['x1'], 0), w['z1']))
    merged = []

    i = 0
    while i < len(h):
        seg = dict(h[i])
        j = i + 1
        while j < len(h):
            nxt = h[j]
            if abs(seg['z1'] - nxt['z1']) < 0.2 and nxt['x1'] <= seg['x2'] + 0.3:
                seg['x2'] = max(seg['x2'], nxt['x2'])
                seg['length'] = round(seg['x2'] - seg['x1'], 2)
                j += 1
            else:
                break
        merged.append(seg)
        i = j

    i = 0
    while i < len(v):
        seg = dict(v[i])
        j = i + 1
        while j < len(v):
            nxt = v[j]
            if abs(seg['x1'] - nxt['x1']) < 0.2 and nxt['z1'] <= seg['z2'] + 0.3:
                seg['z2'] = max(seg['z2'], nxt['z2'])
                seg['length'] = round(seg['z2'] - seg['z1'], 2)
                j += 1
            else:
                break
        merged.append(seg)
        i = j

    return merged


def merge_double_lines(walls):
    """Merge parallel walls that are within 0.3m of each other (double-line rendering)."""
    if not walls:
        return walls

    result = []
    used = set()

    for i, w1 in enumerate(walls):
        if i in used:
            continue
        best = dict(w1)
        for j, w2 in enumerate(walls):
            if j <= i or j in used:
                continue
            if w1['orientation'] != w2['orientation']:
                continue
            if w1['orientation'] == 'horizontal':
                if abs(w1['z1'] - w2['z1']) < 0.3:
                    overlap_x = min(w1['x2'], w2['x2']) - max(w1['x1'], w2['x1'])
                    if overlap_x > 0:
                        best['x1'] = min(best['x1'], w2['x1'])
                        best['x2'] = max(best['x2'], w2['x2'])
                        best['length'] = round(best['x2'] - best['x1'], 2)
                        used.add(j)
            else:
                if abs(w1['x1'] - w2['x1']) < 0.3:
                    overlap_z = min(w1['z2'], w2['z2']) - max(w1['z1'], w2['z1'])
                    if overlap_z > 0:
                        best['z1'] = min(best['z1'], w2['z1'])
                        best['z2'] = max(best['z2'], w2['z2'])
                        best['length'] = round(best['z2'] - best['z1'], 2)
                        used.add(j)
        result.append(best)

    return result


if __name__ == '__main__':
    analyze(
        sys.argv[1] if len(sys.argv) > 1 else '/Users/deekshaa/Desktop/fact-view/backend/uploads/83520c4a-8894-4c79-b151-61fcec518627.png',
        float(sys.argv[2]) if len(sys.argv) > 2 else 20,
        float(sys.argv[3]) if len(sys.argv) > 3 else 15,
        sys.argv[4] if len(sys.argv) > 4 else '/Users/deekshaa/Desktop/fact-view/backend/floor_plan_data.json'
    )
