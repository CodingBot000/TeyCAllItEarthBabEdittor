import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';

export function alignCylinder(mesh: Mesh, start: Vector3, end: Vector3): void {
  const direction = end.subtract(start);
  mesh.position = start.add(end).scale(0.5);
  mesh.scaling.y = direction.length();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), new Quaternion());
}
