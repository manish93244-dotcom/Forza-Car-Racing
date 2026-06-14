/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PhysicsParams {
  mass: number;
  motorTorque: number;
  maxSteerAngle: number;
  brakeForce: number;
  suspensionSpring: number; // N/m
  suspensionDamper: number; // N/m/s
  suspensionDistance: number; // travel in meters
  targetPosition: number; // 0-1 (rest position)
  tireCompound: 'Street' | 'Slick' | 'Rain' | 'Offroad';
  rollStiffness: number; // Anti-roll bar
}

export type WeatherType = 'Sunny' | 'Rainy' | 'Muddy' | 'Snowy';
export type RouteType = 'Asphalt Circuit' | 'Harbor Loop' | 'Dusty Dunes' | 'Alpine Peak';

export interface RouteData {
  id: RouteType;
  name: string;
  description: string;
  baseFriction: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  checkpoints: { x: number; y: number; radius: number }[];
  startPos: { x: number; y: number; angle: number };
  width: number;
  height: number;
  walls: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  route: RouteType;
  weather: WeatherType;
  carName: string;
  lapTime: number; // in ms
  driftScore: number;
  date: string;
}

export interface CarSetup {
  id: string;
  name: string;
  weightClass: string;
  baseParams: PhysicsParams;
  visualColor: string;
}
