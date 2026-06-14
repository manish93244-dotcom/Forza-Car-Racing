/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { PhysicsParams, WeatherType, RouteType, RouteData, CarSetup } from '../types';
import { audioEngine } from './AudioEngine';
import { RotateCcw, Power, Volume2, VolumeX, Keyboard, Compass, Gauge, AlertCircle, Clock, Flame } from 'lucide-react';

// Definitions of racing routes on 900x600 logical screen coordinates
const TRACKS_DATA: Record<RouteType, RouteData> = {
  'Asphalt Circuit': {
    id: 'Asphalt Circuit',
    name: 'Monza GP GP Circuit',
    description: 'High-speed sweeping turns on perfect high-friction tarmac.',
    baseFriction: 1.0,
    difficulty: 'Easy',
    width: 900,
    height: 600,
    startPos: { x: 450, y: 500, angle: 0 }, // angle 0 is facing right
    checkpoints: [
      { x: 750, y: 500, radius: 60 },
      { x: 800, y: 200, radius: 60 },
      { x: 450, y: 150, radius: 60 },
      { x: 120, y: 200, radius: 60 },
      { x: 150, y: 500, radius: 60 },
      { x: 450, y: 500, radius: 60 }, // Lap trigger (Finish Line)
    ],
    walls: [] // track boundaries
  },
  'Harbor Loop': {
    id: 'Harbor Loop',
    name: 'Wet Marina Bay Marina',
    description: 'Challenging narrow urban streets with short, sharp braking zones.',
    baseFriction: 0.65,
    difficulty: 'Medium',
    width: 900,
    height: 600,
    startPos: { x: 150, y: 480, angle: -Math.PI / 2 }, // facing up
    checkpoints: [
      { x: 150, y: 150, radius: 55 },
      { x: 450, y: 150, radius: 55 },
      { x: 450, y: 350, radius: 55 },
      { x: 750, y: 350, radius: 55 },
      { x: 750, y: 500, radius: 55 },
      { x: 150, y: 500, radius: 55 }, // Lap trigger point
    ],
    walls: []
  },
  'Dusty Dunes': {
    id: 'Dusty Dunes',
    name: 'Sahara Rally Dunes',
    description: 'Winding desert dirt trails with sand drifts and dynamic friction.',
    baseFriction: 0.48,
    difficulty: 'Hard',
    width: 900,
    height: 600,
    startPos: { x: 450, y: 300, angle: 0 },
    checkpoints: [
      { x: 720, y: 150, radius: 65 },
      { x: 750, y: 450, radius: 65 },
      { x: 450, y: 500, radius: 65 },
      { x: 150, y: 450, radius: 65 },
      { x: 180, y: 150, radius: 65 },
      { x: 450, y: 120, radius: 65 },
      { x: 450, y: 300, radius: 65 } // Back to center finish
    ],
    walls: []
  },
  'Alpine Peak': {
    id: 'Alpine Peak',
    name: 'Siberian Ice Stadium',
    description: 'Continuous circular frozen lake ring built strictly for extreme drifting.',
    baseFriction: 0.28,
    difficulty: 'Extreme',
    width: 900,
    height: 600,
    startPos: { x: 450, y: 480, angle: 0 },
    checkpoints: [
      { x: 750, y: 300, radius: 70 },
      { x: 450, y: 120, radius: 70 },
      { x: 150, y: 300, radius: 70 },
      { x: 450, y: 480, radius: 70 }, // Lap trigger
    ],
    walls: []
  }
};

interface SimulatorProps {
  physicsParams: PhysicsParams;
  weather: WeatherType;
  route: RouteType;
  carColor: string;
  carName: string;
  onLapCompleted: (lapTime: number, totalDrift: number) => void;
}

export default function CarSimulator({
  physicsParams,
  weather,
  route,
  carColor,
  carName,
  onLapCompleted
}: SimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Simulation Game states
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);

  useEffect(() => {
    // Auto-enable for touch-capable devices / screens
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setShowTouchControls(isTouch);
  }, []);
  
  // Dashboard Telemetry
  const [speedKmh, setSpeedKmh] = useState(0);
  const [rpm, setRpm] = useState(800);
  const [gear, setGear] = useState(1);
  const [nextCheckpointIdx, setNextCheckpointIdx] = useState(0);
  const [lapTimer, setLapTimer] = useState(0); // overall lap seconds
  const [driftPoints, setDriftPoints] = useState(0);
  const [activeDriftSlip, setActiveDriftSlip] = useState(0);
  const [isDrifting, setIsDrifting] = useState(false);

  // Wheel loads (Suspension compressions for telemetry UI bars)
  const [wheelLoads, setWheelLoads] = useState({
    FL: 1.0,
    FR: 1.0,
    RL: 1.0,
    RR: 1.0,
  });

  // Controls input ref for low latency in frame loop
  const inputsRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false
  });

  // Track & Path metrics
  const track = TRACKS_DATA[route];
  
  // Custom high density coordinates compiler for looping road segments in 3D projection
  const densePoints = React.useMemo(() => {
    const lerp = (x1: number, y1: number, x2: number, y2: number, t: number) => ({
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t
    });

    const bezier = (x1: number, y1: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x2: number, y2: number, t: number) => {
      const cx = 3 * (cp1x - x1);
      const bx = 3 * (cp2x - cp1x) - cx;
      const ax = x2 - x1 - cx - bx;
      
      const cy = 3 * (cp1y - y1);
      const by = 3 * (cp2y - cp1y) - cy;
      const ay = y2 - y1 - cy - by;
      
      return {
        x: ax * t * t * t + bx * t * t + cx * t + x1,
        y: ay * t * t * t + by * t * t + cy * t + y1
      };
    };

    const quad = (x1: number, y1: number, cpx: number, cpy: number, x2: number, y2: number, t: number) => {
      const mt = 1 - t;
      return {
        x: mt * mt * x1 + 2 * mt * t * cpx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cpy + t * t * y2
      };
    };

    if (route === 'Asphalt Circuit') {
      const p: { x: number; y: number }[] = [];
      // 1. Straight Line (150, 500) -> (750, 500)
      for (let i = 0; i < 90; i++) p.push(lerp(150, 500, 750, 500, i / 90));
      // 2. Bezier Curve right (750, 500) -> (750, 200)
      for (let i = 0; i < 90; i++) p.push(bezier(750, 500, 900, 500, 900, 200, 750, 200, i / 90));
      // 3. Straight Line (750, 200) -> (150, 200)
      for (let i = 0; i < 90; i++) p.push(lerp(750, 200, 150, 200, i / 90));
      // 4. Bezier Curve left (150, 200) -> (150, 500)
      for (let i = 0; i < 90; i++) p.push(bezier(150, 200, 0, 200, 0, 500, 150, 500, i / 90));
      return p;
    } else if (route === 'Harbor Loop') {
      const p: { x: number; y: number }[] = [];
      const corners = [
        { x: 150, y: 500 },
        { x: 150, y: 150 },
        { x: 450, y: 150 },
        { x: 450, y: 350 },
        { x: 750, y: 350 },
        { x: 750, y: 500 },
      ];
      for (let c = 0; c < corners.length; c++) {
        const p1 = corners[c];
        const p2 = corners[(c + 1) % corners.length];
        const segs = c === 0 ? 80 : c === 1 ? 60 : c === 2 ? 40 : c === 3 ? 60 : c === 4 ? 40 : 80;
        for (let i = 0; i < segs; i++) {
          p.push(lerp(p1.x, p1.y, p2.x, p2.y, i / segs));
        }
      }
      return p;
    } else if (route === 'Dusty Dunes') {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i < 90; i++) p.push(quad(450, 300, 720, 150, 750, 450, i / 90));
      for (let i = 0; i < 90; i++) p.push(quad(750, 450, 450, 520, 150, 450, i / 90));
      for (let i = 0; i < 90; i++) p.push(quad(150, 450, 180, 150, 450, 120, i / 90));
      for (let i = 0; i < 90; i++) p.push(lerp(450, 120, 450, 300, i / 90));
      return p;
    } else { // Alpine Peak (Ring)
      const p: { x: number; y: number }[] = [];
      const count = 360;
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        p.push({
          x: 450 + Math.cos(theta) * 180,
          y: 300 + Math.sin(theta) * 180
        });
      }
      return p;
    }
  }, [route]);

  const frictionCoefficient = track.baseFriction * (
    weather === 'Sunny' ? 1.0 :
    weather === 'Rainy' ? 0.65 :
    weather === 'Muddy' ? 0.52 : 0.35 // Snowy
  );

  // Rigidbody state
  const carStateRef = useRef({
    x: track.startPos.x,
    y: track.startPos.y,
    angle: track.startPos.angle, // rotation angle in radians (0 is right)
    vx: 0,
    vy: 0,
    angularVelocity: 0,
    lapStartMs: 0,
    isFirstCheckpointPassed: false,
    driftAccumulator: 0,
    tireTracks: [] as { x: number; y: number; opacity: number; color: string }[],
  });

  // Reset physics state when track changes
  useEffect(() => {
    const initializedTrack = TRACKS_DATA[route];
    const state = carStateRef.current;
    state.x = initializedTrack.startPos.x;
    state.y = initializedTrack.startPos.y;
    state.angle = initializedTrack.startPos.angle;
    state.vx = 0;
    state.vy = 0;
    state.angularVelocity = 0;
    state.isFirstCheckpointPassed = false;
    state.driftAccumulator = 0;
    state.tireTracks = [];
    setNextCheckpointIdx(0);
    setLapTimer(0);
    setDriftPoints(0);
  }, [route]);

  // Audio mute sync
  const toggleMute = () => {
    const nextMuted = audioEngine.toggleMute();
    setIsMuted(nextMuted);
  };

  const startEngine = () => {
    audioEngine.start();
    setAudioActive(true);
    setIsPlaying(true);
    carStateRef.current.lapStartMs = Date.now();
  };

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser scrolling with arrow keys inside app
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      const inputs = inputsRef.current;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputs.forward = true;
          break;
        case 's':
        case 'arrowdown':
          inputs.backward = true;
          break;
        case 'a':
        case 'arrowleft':
          inputs.left = true;
          break;
        case 'd':
        case 'arrowright':
          inputs.right = true;
          break;
        case ' ': // Spacebar
          inputs.handbrake = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const inputs = inputsRef.current;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputs.forward = false;
          break;
        case 's':
        case 'arrowdown':
          inputs.backward = false;
          break;
        case 'a':
        case 'arrowleft':
          inputs.left = false;
          break;
        case 'd':
        case 'arrowright':
          inputs.right = false;
          break;
        case ' ':
          inputs.handbrake = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Frame simulation and canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let lastTime = performance.now();

    let localSpeedKmh = 0;
    let localRpm = 800;
    let localGear = 1;
    let localLapTimer = 0;
    let frameCount = 0;

    // Secondary snow/rain particle effects
    const weatherParticles: { x: number; y: number; vy: number; vx: number; r: number }[] = [];
    for (let i = 0; i < 60; i++) {
      weatherParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vy: weather === 'Rainy' ? 8 + Math.random() * 6 : 2 + Math.random() * 3,
        vx: weather === 'Snowy' ? -3 - Math.random() * 2 : (Math.random() - 0.5) * 2,
        r: weather === 'Rainy' ? 1.5 : 2 + Math.random() * 2,
      });
    }

    const gameLoop = (timeNow: number) => {
      const dt = Math.min((timeNow - lastTime) / 1000, 0.1); // cap dt at 100ms
      lastTime = timeNow;
      frameCount++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Current Route information
      const activeTrack = TRACKS_DATA[route];
      const state = carStateRef.current;
      const inputs = inputsRef.current;

      let targetSteer = 0;

      // --- SIMULATE CAR PHYSICS (FORZA ENGINE DEVIATION OVER TOP-DOWN DRIVING) ---
      if (isPlaying) {
        // Core tunable variables
        const mass = physicsParams.mass;
        const motorPower = physicsParams.motorTorque;
        const maxSteerLimit = (physicsParams.maxSteerAngle * Math.PI) / 180;
        const brakesStrength = physicsParams.brakeForce;
        
        // Calculate speed vectors
        const fwdX = Math.cos(state.angle);
        const fwdY = Math.sin(state.angle);
        
        // Local velocities
        const dotProd = state.vx * fwdX + state.vy * fwdY;
        const localVfwd = dotProd; // forward moving speed
        const localVside = -state.vx * fwdY + state.vy * fwdX; // side slipping speed

        // Speed in KMH
        const curSpeedKmh = Math.abs(localVfwd) * 3.6;
        localSpeedKmh = curSpeedKmh;

        // Speed-Sensitive Steering Lock reduction: Less restrictive at high speeds for ultra-responsive turn-in
        const attenuation = Math.max(0.78, 1.0 - (curSpeedKmh / 220) * 0.22);
        const activeMaxSteer = maxSteerLimit * attenuation;

        // Steering angle interpolation
        targetSteer = 0;
        if (inputs.left) targetSteer -= activeMaxSteer;
        if (inputs.right) targetSteer += activeMaxSteer;

        // Accelerating and Braking forces
        let forwardForce = 0;
        if (inputs.forward) {
          forwardForce += motorPower * 4.5;
        }
        if (inputs.backward) {
          // reverse or brake
          if (localVfwd > 0.5) {
            forwardForce -= brakesStrength * 2.2;
          } else {
            forwardForce -= motorPower * 2.1; // Reverse speed torque
          }
        }
        if (inputs.handbrake) {
          // strong wheel locking braking force
          forwardForce -= brakesStrength * 4.5 * Math.sign(localVfwd);
        }

        // Tires friction calculations with Dynamic Grip weather multiplier
        const totalMaxGrip = mass * 9.81 * frictionCoefficient; // normal load friction circle
        
        // Static and sideways frictional coefficients
        const dragForce = -0.5 * 0.35 * localVfwd * Math.abs(localVfwd); // air drag resistance
        const rollingResistance = -0.05 * localVfwd * mass;

        // Front / Rear split lateral forces for oversteer/drifting
        // Front wheels turn, rear wheels are locked forward.
        const frontComDist = 18; // wheel distance relative to center
        const rearComDist = -16;

        // Lateral speed of front and rear axles
        const vSideFront = localVside + state.angularVelocity * frontComDist;
        const vSideRear = localVside + state.angularVelocity * rearComDist;

        // Steer slip angle
        const slipAngleFront = Math.atan2(vSideFront, Math.abs(localVfwd) + 0.1) - (targetSteer * Math.sign(localVfwd || 1));
        const slipAngleRear = Math.atan2(vSideRear, Math.abs(localVfwd) + 0.1);

        // Friction budget allocation (Pacejka lateral tire model approximation)
        const tireStiffnessFront = totalMaxGrip * 0.50; // Increased massively for incredibly sharp front turn-in response
        const tireStiffnessRear = totalMaxGrip * 0.32 * (inputs.handbrake ? 0.22 : 1.0); // Perfect slip-angle balance

        let latForceFront = -Math.sin(slipAngleFront) * tireStiffnessFront;
        let latForceRear = -Math.sin(slipAngleRear) * tireStiffnessRear;

        // Normalizing limits of traction budget: Raised ceiling limit for ultra-sharp tire grip bite!
        if (Math.abs(latForceFront) > totalMaxGrip * 0.82) {
          latForceFront = Math.sign(latForceFront) * totalMaxGrip * 0.82;
        }
        if (Math.abs(latForceRear) > totalMaxGrip * 0.72) {
          latForceRear = Math.sign(latForceRear) * totalMaxGrip * 0.72;
        }

        // --- REALISTIC WEIGHT TRANSFER ENGINE (SUSPENSION LOAD DEVIATION) ---
        // Accelerating dumps load on Rear suspension. Braking dumps load on Front.
        // Fast yaw cornering transfers weight from inside wheels to outside wheels.
        const accG = (forwardForce / mass) / 9.81; // forward longitudinal G-force
        const latG = (localVfwd * state.angularVelocity) / 9.81; // lateral G-force

        // Baseline loads
        let loadFL = 1.0 - (accG * 0.22) - (latG * 0.30) * Math.sign(targetSteer || 1);
        let loadFR = 1.0 - (accG * 0.22) + (latG * 0.30) * Math.sign(targetSteer || 1);
        let loadRL = 1.0 + (accG * 0.22) - (latG * 0.30) * Math.sign(targetSteer || 1);
        let loadRR = 1.0 + (accG * 0.22) + (latG * 0.30) * Math.sign(targetSteer || 1);

        // Bound loads safely
        setWheelLoads({
          FL: Math.max(0.2, Math.min(1.8, loadFL)),
          FR: Math.max(0.2, Math.min(1.8, loadFR)),
          RL: Math.max(0.2, Math.min(1.8, loadRL)),
          RR: Math.max(0.2, Math.min(1.8, loadRR)),
        });

        // Lateral Force Sum and Torque
        const F_latTotal = (latForceFront + latForceRear);
        const T_yawTotal = (latForceFront * frontComDist - latForceRear * rearComDist);

        // Update body velocities (World coordinate space integration)
        const bodyAccelFwd = (forwardForce + dragForce + rollingResistance) / mass;
        const bodyAccelLat = F_latTotal / mass;

        // Angular acceleration
        const rotationalInertia = mass * 7.5; // Lower Moment of Inertia for snappy, immediate steering rotation!
        const angularAccel = T_yawTotal / rotationalInertia;

        state.angularVelocity += angularAccel * dt;
        // Damping of rotation
        state.angularVelocity *= 0.95;

        // Global acceleration mapping
        const accelX = fwdX * bodyAccelFwd - fwdY * bodyAccelLat;
        const accelY = fwdY * bodyAccelFwd + fwdX * bodyAccelLat;

        state.vx += accelX * dt;
        state.vy += accelY * dt;

        // Position changes
        state.x += state.vx * dt * 25; // amplify visual speed relative to logic coordinates
        state.y += state.vy * dt * 25;
        state.angle += state.angularVelocity * dt;

        // Drift analysis (based on difference between wheel angles and motion)
        const sideSlipRatio = Math.abs(localVside) / (Math.abs(localVfwd) + 1.0);
        const slipIntensity = Math.min(1.0, sideSlipRatio * 1.5);
        
        const driftActive = sideSlipRatio > 0.18 && curSpeedKmh > 10;
        
        if (frameCount % 10 === 0) {
          setActiveDriftSlip(slipIntensity);
          setIsDrifting(driftActive);
        }

        // Accumulate drift score if drifting elegantly
        if (driftActive) {
          state.driftAccumulator += Math.round(dt * 150 * (1.0 + sideSlipRatio));
          if (frameCount % 10 === 0) {
            setDriftPoints(Math.round(state.driftAccumulator));
          }
          const driftValEl = document.getElementById("hud-drift-val");
          if (driftValEl) {
            driftValEl.textContent = Math.round(state.driftAccumulator).toString();
          }
        }

        // Add skid tire tracks if slipping
        if (sideSlipRatio > 0.08 || inputs.handbrake) {
          const trackColor = weather === 'Snowy' ? 'rgba(230,230,250,0.15)' : 'rgba(10,10,12,0.18)';
          state.tireTracks.push({
            x: state.x - Math.cos(state.angle) * 12,
            y: state.y - Math.sin(state.angle) * 12,
            opacity: Math.min(0.4, sideSlipRatio * 0.6),
            color: trackColor
          });
          // Cap lists of tracks
          if (state.tireTracks.length > 350) state.tireTracks.shift();
        }

        // --- DYNAMIC TRACK BOUNDARY COLLISION STOPPER & REBOUND ---
        let nearestSegmentIdx = 0;
        let nearestSegmentDist = Infinity;
        for (let i = 0; i < densePoints.length; i++) {
          const d = Math.hypot(state.x - densePoints[i].x, state.y - densePoints[i].y);
          if (d < nearestSegmentDist) {
            nearestSegmentDist = d;
            nearestSegmentIdx = i;
          }
        }

        const standardRoadWidth = 105;
        // Curb outline is standardRoadWidth / 2 + custom threshold boundary
        const boundaryLimitThresh = (standardRoadWidth / 2) + 6; 
        if (nearestSegmentDist > boundaryLimitThresh) {
          const currentVelSpeed = Math.hypot(state.vx, state.vy);
          if (currentVelSpeed > 0.3) {
            // Trigger crash scrape sound effect scaled by speed!
            audioEngine.playCrashSound(currentVelSpeed * 15);
          }

          // Stop / Rebound back into the track boundary instantly
          const centerPt = densePoints[nearestSegmentIdx];
          const trackOff_x = state.x - centerPt.x;
          const trackOff_y = state.y - centerPt.y;
          const totalOff = Math.hypot(trackOff_x, trackOff_y);
          if (totalOff > 0) {
            // Limit coordinate precisely to bounding curb edge
            state.x = centerPt.x + (trackOff_x / totalOff) * boundaryLimitThresh;
            state.y = centerPt.y + (trackOff_y / totalOff) * boundaryLimitThresh;
          }

          // Halting momentum with bounce repulsion: Stops the car on track boundary impact
          state.vx = -state.vx * 0.12;
          state.vy = -state.vy * 0.12;
          state.angularVelocity *= -0.15;
        }

        // Boundary collision bounds (keeps car bouncing off grid borders as safety fallback)
        const padding = 20;
        if (state.x < padding) {
          state.x = padding;
          state.vx *= -0.4;
          audioEngine.playCrashSound(Math.abs(state.vx) * 10);
        } else if (state.x > canvas.width - padding) {
          state.x = canvas.width - padding;
          state.vx *= -0.4;
          audioEngine.playCrashSound(Math.abs(state.vx) * 10);
        }

        if (state.y < padding) {
          state.y = padding;
          state.vy *= -0.4;
          audioEngine.playCrashSound(Math.abs(state.vy) * 10);
        } else if (state.y > canvas.height - padding) {
          state.y = canvas.height - padding;
          state.vy *= -0.4;
          audioEngine.playCrashSound(Math.abs(state.vy) * 10);
        }

        // --- CHECKPOINT COLLISION GAME LOOP ---
        const activeTarget = activeTrack.checkpoints[nextCheckpointIdx];
        const distToCheckpoint = Math.hypot(state.x - activeTarget.x, state.y - activeTarget.y);
        
        if (distToCheckpoint < activeTarget.radius) {
          // Collision! Trigger checkpoint sound and progress
          audioEngine.playCheckpointSound();
          
          if (nextCheckpointIdx === 0) {
            state.isFirstCheckpointPassed = true;
          }

          const nextIdx = (nextCheckpointIdx + 1) % activeTrack.checkpoints.length;
          setNextCheckpointIdx(nextIdx);

          // Full lap completed!
          if (nextIdx === 0 && state.isFirstCheckpointPassed) {
            const timeElapsed = Date.now() - state.lapStartMs;
            onLapCompleted(timeElapsed, Math.round(state.driftAccumulator));
            
            // Reset lap timer
            state.lapStartMs = Date.now();
            state.driftAccumulator = 0;
            setDriftPoints(0);
          }
        }

        // --- COCKPIT RPM & SOUND INTEGRATION ---
        // Model shifting through 5 gears
        let activeGear = 1;
        let gearRatio = 1.0;
        if (curSpeedKmh > 130) {
          activeGear = 5;
          gearRatio = 4.8;
        } else if (curSpeedKmh > 95) {
          activeGear = 4;
          gearRatio = 3.6;
        } else if (curSpeedKmh > 65) {
          activeGear = 3;
          gearRatio = 2.4;
        } else if (curSpeedKmh > 32) {
          activeGear = 2;
          gearRatio = 1.4;
        }
        localGear = activeGear;

        // Map speeds within gear to specific engine tones (800 RPM to 7800 RPM)
        const minGearSpeed = activeGear === 1 ? 0 : activeGear === 2 ? 32 : activeGear === 3 ? 65 : activeGear === 4 ? 95 : 130;
        const maxGearSpeed = activeGear === 1 ? 32 : activeGear === 2 ? 65 : activeGear === 3 ? 95 : activeGear === 4 ? 130 : 210;
        
        const speedInGearLimit = Math.max(0, Math.min(1.0, (curSpeedKmh - minGearSpeed) / (maxGearSpeed - minGearSpeed + 1)));
        const calculatedRpm = 1100 + (speedInGearLimit * 5400) + (inputs.forward ? 1000 : 0) - (inputs.backward ? 400 : 0);
        const boundedRpm = Math.max(800, Math.min(7800, calculatedRpm));
        localRpm = boundedRpm;

        // Submit to custom audio synth
        if (audioActive) {
          audioEngine.setRPM(boundedRpm, 8000);
          audioEngine.setThrottle(inputs.forward ? 1.0 : inputs.backward ? 0.3 : 0.0);
          audioEngine.setDrift(slipIntensity);
        }

        // Update Lap Timer state
        const overallTimer = (Date.now() - state.lapStartMs) / 1000;
        localLapTimer = overallTimer;

        // High-performance Direct DOM Updates at 60 FPS for instantaneous zero-lag visual sync!
        const speedValEl = document.getElementById("hud-speedometer-val");
        if (speedValEl) {
          speedValEl.textContent = Math.round(curSpeedKmh).toString();
        }

        const rpmBarEl = document.getElementById("hud-rpm-bar");
        if (rpmBarEl) {
          rpmBarEl.style.width = `${(boundedRpm / 8000) * 100}%`;
          if (boundedRpm > 6800) {
            rpmBarEl.className = "h-full transition-none bg-rose-500 animate-pulse";
          } else if (boundedRpm > 4500) {
            rpmBarEl.className = "h-full transition-none bg-amber-400";
          } else {
            rpmBarEl.className = "h-full transition-none bg-indigo-500";
          }
        }
        const rpmTextEl = document.getElementById("hud-rpm-text");
        if (rpmTextEl) {
          rpmTextEl.textContent = `${Math.round(boundedRpm)} RPM`;
        }

        const gearValEl = document.getElementById("hud-gear-val");
        if (gearValEl) {
          gearValEl.textContent = activeGear.toString();
        }

        const raceTimeValEl = document.getElementById("hud-racetime-val");
        if (raceTimeValEl) {
          raceTimeValEl.textContent = formatTimer(overallTimer);
        }

        // Throttle React state triggers to 6 Hz (every 10 frames) to eliminate heavy Virtual DOM rendering lags!
        if (frameCount % 10 === 0) {
          setSpeedKmh(Math.round(curSpeedKmh));
          setRpm(Math.round(boundedRpm));
          setGear(activeGear);
          setLapTimer(overallTimer);
        }
      }

      // --- RENDER VISUAL BACKGROUND & CHECKPOINT GATES ---
      // Camera following behind the car in 3D perspective space: High third-person downward perspective view for clear vision of curves ahead
      const camDist = 52;
      const camHeight = 13.5; 
      
      const camX = state.x - Math.cos(state.angle) * camDist;
      const camY = state.y - Math.sin(state.angle) * camDist;
      const camAngle = state.angle;
      const cosA = Math.cos(camAngle);
      const sinA = Math.sin(camAngle);
      
      const project3D = (wx: number, wy: number, wz: number) => {
        // Translate relative to camera positioning coordinates
        const dx = wx - camX;
        const dy = wy - camY;
        
        // Rotate matching camera orientation heading (0 is facing right)
        // Local Right
        const rx = dx * -sinA + dy * cosA;
        // Local Forward (into the viewport screen)
        const ry = dx * cosA + dy * sinA;
        // Local Up: Map world height to screen height (Canvas Y increases downward, so elevated height means smaller screen Y)
        const rz = camHeight - wz;
        
        if (ry < 1.0) { // point is behind the camera viewer lens
          return null;
        }
        
        const fovScale = 475; // field of view factor
        const sx = (rx / ry) * fovScale + (900 / 2);
        const sy = (rz / ry) * fovScale + (600 * 0.46); // horizon raised to 46% of screen height to tilt view upward
        
        return { x: sx, y: sy, depth: ry };
      };

      const drawScenicObject = (
        wx: number,
        wy: number,
        depth: number,
        trackRoute: string,
        seed: number
      ) => {
        // Project base position of visual object to 3D perspective coordinate
        const base = project3D(wx, wy, 0);
        if (!base) return;

        const scale = 400 / depth; // proportional scaling
        if (scale < 0.1) return; // ignore object if too far back

        ctx.save();
        
        if (trackRoute === 'Dusty Dunes') {
          // --- DESERT PARADISE: CACTUS & DRY SHRUBS & ROCK PYRAMIDS ---
          if (seed % 2 === 0) {
            // Saguaro Cactus
            const cHeight = 25 * scale;
            const cWidth = 3.6 * scale;
            
            // Cactus Trunk
            ctx.fillStyle = '#166534';
            ctx.fillRect(base.x - cWidth/2, base.y - cHeight, cWidth, cHeight);
            
            // Top circular cap
            ctx.beginPath();
            ctx.arc(base.x, base.y - cHeight, cWidth/2, 0, Math.PI * 2);
            ctx.fill();
            
            // Left Hook Branch
            ctx.strokeStyle = '#166534';
            ctx.lineWidth = cWidth * 0.95;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - cHeight * 0.45);
            ctx.lineTo(base.x - cWidth * 1.6, base.y - cHeight * 0.45);
            ctx.lineTo(base.x - cWidth * 1.6, base.y - cHeight * 0.82);
            ctx.stroke();
            
            // Right Hook Branch
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - cHeight * 0.6);
            ctx.lineTo(base.x + cWidth * 1.65, base.y - cHeight * 0.6);
            ctx.lineTo(base.x + cWidth * 1.65, base.y - cHeight * 0.92);
            ctx.stroke();
          } else {
            // Monument Rock Peak of Sahara Dunes
            const rSize = (20 + (seed % 10) * 4) * scale;
            ctx.fillStyle = '#9a3412';
            ctx.strokeStyle = '#450a0a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - rSize * 1.5);
            ctx.lineTo(base.x - rSize, base.y);
            ctx.lineTo(base.x + rSize, base.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Natural sunlight ambient shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - rSize * 1.5);
            ctx.lineTo(base.x, base.y);
            ctx.lineTo(base.x + rSize, base.y);
            ctx.closePath();
            ctx.fill();
          }
        } else if (trackRoute === 'Alpine Peak') {
          // --- TAIGA REGION: SNOWY PINE TREES COLLATERAL TO THE RING ---
          if (seed % 3 === 0) {
            // Beautiful cozy wooden mountain cabin
            const w = 26 * scale;
            const h = 15 * scale;
            ctx.fillStyle = '#451a03'; // Redwood logs
            ctx.fillRect(base.x - w/2, base.y - h, w, h);
            
            // Bright Snow triangular white roof cap
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - h - 11 * scale);
            ctx.lineTo(base.x - w/2 - 5 * scale, base.y - h);
            ctx.lineTo(base.x + w/2 + 5 * scale, base.y - h);
            ctx.closePath();
            ctx.fill();
            
            // Yellow window cozy lantern fire glow
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(base.x - 3 * scale, base.y - h * 0.6, 6 * scale, 5 * scale);
          } else {
            // Snowy Pine Tree
            const tHeight = (30 + (seed % 12) * 2) * scale;
            const trunkW = 3.5 * scale;
            
            // Base wooden trunk
            ctx.fillStyle = '#271001';
            ctx.fillRect(base.x - trunkW/2, base.y - tHeight, trunkW, tHeight);
            
            // Overlapping pine branch layers
            ctx.fillStyle = '#064e3b';
            for (let tier = 0; tier < 3; tier++) {
              const tierY = base.y - tHeight * (0.28 + tier * 0.28);
              const tierW = (19 - tier * 4.5) * scale;
              const tierH = 11 * scale;
              
              ctx.beginPath();
              ctx.moveTo(base.x, tierY - tierH * 1.35);
              ctx.lineTo(base.x - tierW, tierY);
              ctx.lineTo(base.x + tierW, tierY);
              ctx.closePath();
              ctx.fill();
              
              // White powdered snow branches detail
              ctx.fillStyle = '#f8fafc';
              ctx.beginPath();
              ctx.moveTo(base.x, tierY - tierH * 1.35);
              ctx.lineTo(base.x - tierW * 0.35, tierY - tierH * 0.82);
              ctx.lineTo(base.x + tierW * 0.35, tierY - tierH * 0.82);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#064e3b'; // reset conifer background color
            }
          }
        } else {
          // --- URBAN CITY DISTRICTS OR HARBOR MARINA: DIGITAL GLOWS AND HIGH CORE TOONS ---
          if (seed % 3 === 0) {
            // Neon Advertisement Billboard Banner
            const legH = 17 * scale;
            const bW = 30 * scale;
            const bH = 17 * scale;
            
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = Math.max(1.5, 3.2 * scale);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(base.x, base.y - legH);
            ctx.stroke();
            
            ctx.fillStyle = '#090d16';
            ctx.strokeStyle = seed % 2 === 0 ? '#ef4444' : '#0ea5e9';
            ctx.lineWidth = Math.max(1, 2.2 * scale);
            ctx.fillRect(base.x - bW/2, base.y - legH - bH, bW, bH);
            ctx.strokeRect(base.x - bW/2, base.y - legH - bH, bW, bH);
            
            ctx.fillStyle = seed % 2 === 0 ? '#ef4444' : '#0ea5e9';
            ctx.font = `bold ${Math.max(5, 5.5 * scale)}px font-mono`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seed % 2 === 0 ? '🏎️ SLOW!' : '⚡ TURBO', base.x, base.y - legH - bH * 0.5);
          } else if (seed % 3 === 1) {
            // High Rise Modern Skyscraper Glass Core template
            const buildW = (28 + (seed % 4) * 6) * scale;
            const buildH = (55 + (seed % 5) * 12) * scale;
            
            ctx.fillStyle = '#020617';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.fillRect(base.x - buildW/2, base.y - buildH, buildW, buildH);
            ctx.strokeRect(base.x - buildW/2, base.y - buildH, buildW, buildH);
            
            // Glowing neon building window plates
            ctx.fillStyle = seed % 2 === 0 ? '#fde047' : '#38bdf8';
            const cols = 4;
            const rows = 7;
            const winW = 2.5 * scale;
            const winH = 3 * scale;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if ((r + c + seed) % 3 === 0) continue; // Realism random window closures
                const winX = base.x - buildW/2 + (c + 0.5) * (buildW / cols) - winW/2;
                const winY = base.y - buildH + (r + 0.5) * (buildH / rows) - winH/2;
                ctx.fillRect(winX, winY, winW, winH);
              }
            }
          } else {
            // Elegant glowing Streetlamp support pole
            const poleH = 35 * scale;
            const armW = 9 * scale;
            
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = Math.max(1.5, 2.5 * scale);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(base.x, base.y - poleH);
            ctx.lineTo(base.x + armW, base.y - poleH + 2 * scale);
            ctx.stroke();
            
            ctx.fillStyle = '#fef08a';
            ctx.shadowColor = '#fef08a';
            ctx.shadowBlur = Math.max(5, 14 * scale);
            ctx.beginPath();
            ctx.arc(base.x + armW, base.y - poleH + 2 * scale, Math.max(1.8, 2 * scale), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        
        ctx.restore();
      };

      // 1. Draw Horizon Sky sunset Gradient (clamped to 276 height matching the tilted camera)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 276);
      skyGrad.addColorStop(0, '#020205');
      if (weather === 'Rainy') {
        skyGrad.addColorStop(1, '#110e1a');
      } else if (weather === 'Muddy') {
        skyGrad.addColorStop(1, '#241a12');
      } else if (weather === 'Snowy') {
        skyGrad.addColorStop(1, '#1e1f26');
      } else {
        skyGrad.addColorStop(1, '#0c0714'); // Sunny
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, 276);

      // 2. Draw Horizontal Panning Skyscraper Skyline Silhouette (wrap-around scroll aligned to 276 bottom)
      const skyScrollOffset = ((state.angle * (900 / (Math.PI * 2))) % 900 + 900) % 900;
      ctx.save();
      ctx.translate(-skyScrollOffset, 0);
      for (let tile = -1; tile <= 2; tile++) {
        const startX = tile * 900;
        ctx.fillStyle = '#050508';
        // Skyscraper blocks offset by -74 to rest on horizon 276 precisely
        ctx.fillRect(startX + 60, 166, 50, 110);
        ctx.fillRect(startX + 120, 126, 80, 150);
        ctx.fillRect(startX + 220, 186, 40, 90);
        ctx.fillRect(startX + 300, 86, 70, 190);
        ctx.fillRect(startX + 410, 146, 90, 130);
        ctx.fillRect(startX + 530, 106, 60, 170);
        ctx.fillRect(startX + 620, 176, 80, 100);
        ctx.fillRect(startX + 740, 136, 70, 140);
        
        // Neon windows in skyscrapers
        ctx.fillStyle = 'rgba(255, 62, 0, 0.22)';
        ctx.fillRect(startX + 140, 146, 10, 60);
        ctx.fillRect(startX + 315, 106, 10, 80);
        ctx.fillRect(startX + 755, 156, 10, 60);
      }
      ctx.restore();

      // 3. Draw Grass Ground Plane (Bottom half carpet starting from tilted horizon 276)
      ctx.fillStyle = weather === 'Snowy' ? '#dae1e7' : weather === 'Muddy' ? '#1f1610' : '#070609';
      ctx.fillRect(0, 276, canvas.width, 324);

      // Find index of the segment closest to the car's current position to draw from there
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < densePoints.length; i++) {
        const d = Math.hypot(state.x - densePoints[i].x, state.y - densePoints[i].y);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }

      // 4. Draw dynamic drift tire skid mud markings projected onto ground in 3D
      for (const trackMark of state.tireTracks) {
        const p_track = project3D(trackMark.x, trackMark.y, 0);
        if (p_track) {
          ctx.fillStyle = trackMark.color;
          ctx.globalAlpha = trackMark.opacity;
          ctx.beginPath();
          ctx.arc(p_track.x, p_track.y, Math.max(1.5, 36 / p_track.depth), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }

      // 5. Draw Racing looping asphalt road segments in 3D using Painter's Algorithm (Furthest to closest)
      const drawRange = 85; // segment distance forward visible
      for (let offset = drawRange; offset >= -6; offset--) {
        const idx = (closestIdx + offset + densePoints.length) % densePoints.length;
        
        const pt1 = densePoints[idx];
        const pt2 = densePoints[(idx + 1) % densePoints.length];
        const pt3 = densePoints[(idx + 2) % densePoints.length];
        
        // Find left and right edges for each segment using tangent normal vectors
        const theta1 = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x) + Math.PI / 2;
        const nx1 = Math.cos(theta1);
        const ny1 = Math.sin(theta1);
        
        const theta2 = Math.atan2(pt3.y - pt2.y, pt3.x - pt2.x) + Math.PI / 2;
        const nx2 = Math.cos(theta2);
        const ny2 = Math.sin(theta2);
        
        const rWidth = 105; // standard logical road width
        
        // Boundary Left Line
        const lx1 = pt1.x + nx1 * (rWidth / 2);
        const ly1 = pt1.y + ny1 * (rWidth / 2);
        const lx2 = pt2.x + nx2 * (rWidth / 2);
        const ly2 = pt2.y + ny2 * (rWidth / 2);
        
        // Boundary Right Line
        const rx1 = pt1.x - nx1 * (rWidth / 2);
        const ry1 = pt1.y - ny1 * (rWidth / 2);
        const rx2 = pt2.x - nx2 * (rWidth / 2);
        const ry2 = pt2.y - ny2 * (rWidth / 2);
        
        const p_l1 = project3D(lx1, ly1, 0);
        const p_r1 = project3D(rx1, ry1, 0);
        const p_l2 = project3D(lx2, ly2, 0);
        const p_r2 = project3D(rx2, ry2, 0);
        
        if (p_l1 && p_r1 && p_l2 && p_r2) {
          // Asphalt tarmac polygonal surface tile
          ctx.fillStyle = weather === 'Snowy' ? '#dae0e5' : weather === 'Muddy' ? '#3d2b1f' : '#141416';
          ctx.beginPath();
          ctx.moveTo(p_l1.x, p_l1.y);
          ctx.lineTo(p_r1.x, p_r1.y);
          ctx.lineTo(p_r2.x, p_r2.y);
          ctx.lineTo(p_l2.x, p_l2.y);
          ctx.closePath();
          ctx.fill();
          
          // Outer zebra checker curbs (Left Side)
          const lcurb_x1 = pt1.x + nx1 * (rWidth / 2 + 15);
          const lcurb_y1 = pt1.y + ny1 * (rWidth / 2 + 15);
          const lcurb_x2 = pt2.x + nx2 * (rWidth / 2 + 15);
          const lcurb_y2 = pt2.y + ny2 * (rWidth / 2 + 15);
          
          const p_lc1 = project3D(lcurb_x1, lcurb_y1, 0);
          const p_lc2 = project3D(lcurb_x2, lcurb_y2, 0);
          
          if (p_lc1 && p_lc2) {
            ctx.fillStyle = (idx % 2 === 0) ? '#ff3e00' : '#ffffff';
            ctx.beginPath();
            ctx.moveTo(p_l1.x, p_l1.y);
            ctx.lineTo(p_lc1.x, p_lc1.y);
            ctx.lineTo(p_lc2.x, p_lc2.y);
            ctx.lineTo(p_l2.x, p_l2.y);
            ctx.closePath();
            ctx.fill();
          }
          
          // Outer zebra checker curbs (Right Side)
          const rcurb_x1 = pt1.x - nx1 * (rWidth / 2 + 15);
          const rcurb_y1 = pt1.y - ny1 * (rWidth / 2 + 15);
          const rcurb_x2 = pt2.x - nx2 * (rWidth / 2 + 15);
          const rcurb_y2 = pt2.y - ny2 * (rWidth / 2 + 15);
          
          const p_rc1 = project3D(rcurb_x1, rcurb_y1, 0);
          const p_rc2 = project3D(rcurb_x2, rcurb_y2, 0);
          
          if (p_rc1 && p_rc2) {
            ctx.fillStyle = (idx % 2 === 0) ? '#ff3e00' : '#ffffff';
            ctx.beginPath();
            ctx.moveTo(p_r1.x, p_r1.y);
            ctx.lineTo(p_rc1.x, p_rc1.y);
            ctx.lineTo(p_rc2.x, p_rc2.y);
            ctx.lineTo(p_r2.x, p_r2.y);
            ctx.closePath();
            ctx.fill();
          }

          // Center yellow dash lane stripes
          if (idx % 3 === 0) {
            const p_c1 = project3D(pt1.x, pt1.y, 0);
            const p_c2 = project3D(pt2.x, pt2.y, 0);
            if (p_c1 && p_c2) {
              ctx.strokeStyle = '#ffcc00';
              ctx.lineWidth = Math.max(1, 12 / ((p_c1.depth + p_c2.depth)/2));
              ctx.beginPath();
              ctx.moveTo(p_c1.x, p_c1.y);
              ctx.lineTo(p_c2.x, p_c2.y);
              ctx.stroke();
            }
          }

          // Procedural Roadside Scenery (Every 4 segments for lush density)
          if (idx % 4 === 0) {
            const sideOffsetDist = 100 + (Math.abs(Math.sin(idx)) * 30); // varied distance from centerline
            const drawLeft = (idx % 8 === 0);
            const ScenarioRight = (idx % 8 === 4);
            
            if (drawLeft && p_l1) {
              const sc_x = pt1.x + nx1 * sideOffsetDist;
              const sc_y = pt1.y + ny1 * sideOffsetDist;
              drawScenicObject(sc_x, sc_y, p_l1.depth, route, idx);
            }
            if (ScenarioRight && p_r1) {
              const sc_x = pt1.x - nx1 * sideOffsetDist;
              const sc_y = pt1.y - ny1 * sideOffsetDist;
              drawScenicObject(sc_x, sc_y, p_r1.depth, route, idx + 1);
            }
          }
        }

        // Draw checkpoint gate structures or finish overhead banners if segment index matches
        activeTrack.checkpoints.forEach((checkpoint, wpIdx) => {
          // Find if checkpoint matches this coordinate node closely
          const distToN = Math.hypot(pt1.x - checkpoint.x, pt1.y - checkpoint.y);
          if (distToN < 10 && p_l1 && p_r1) {
            const isTarget = wpIdx === nextCheckpointIdx;
            
            // Pillar heights
            const pHeight = 26;
            const p_lp_top = project3D(lx1, ly1, pHeight);
            const p_rp_top = project3D(rx1, ry1, pHeight);
            
            if (p_lp_top && p_rp_top) {
              // Draw gate supports poles
              ctx.strokeStyle = isTarget ? 'rgba(34, 197, 94, 0.85)' : 'rgba(100, 116, 139, 0.5)';
              ctx.lineWidth = Math.max(2.5, 240 / p_l1.depth);
              ctx.beginPath();
              ctx.moveTo(p_l1.x, p_l1.y);
              ctx.lineTo(p_lp_top.x, p_lp_top.y);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.moveTo(p_r1.x, p_r1.y);
              ctx.lineTo(p_rp_top.x, p_rp_top.y);
              ctx.stroke();
              
              // Draw overhead cross beam span card
              const capH = Math.max(7, 125 / p_l1.depth);
              const activeThemeColor = isTarget ? '#22c55e' : '#01b8d6';
              
              ctx.fillStyle = 'rgba(10, 10, 12, 0.9)';
              ctx.strokeStyle = activeThemeColor;
              ctx.lineWidth = Math.max(1.5, 45 / p_l1.depth);
              ctx.beginPath();
              ctx.moveTo(p_lp_top.x, p_lp_top.y - capH/2);
              ctx.lineTo(p_rp_top.x, p_rp_top.y - capH/2);
              ctx.lineTo(p_rp_top.x, p_rp_top.y + capH/2);
              ctx.lineTo(p_lp_top.x, p_lp_top.y + capH/2);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              
              // Spanning label: "FINISH GATE" or checkpoint index
              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.max(6, 115 / p_l1.depth)}px font-mono`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const label = wpIdx === activeTrack.checkpoints.length - 1 ? '🏁 SPEEDWAY FINISH' : `CHECKPOINT 0${wpIdx + 1}`;
              ctx.fillText(label, (p_lp_top.x + p_rp_top.x)/2, (p_lp_top.y + p_rp_top.y)/2);
            }
          }
        });

        // Occasional scenic roadside neon banners or fences to improve speed illusion
        if (idx % 15 === 0 && p_l1 && p_l2) {
          const bannerH = 12;
          const p_sign_top1 = project3D(lx1, ly1, bannerH);
          const p_sign_top2 = project3D(lx2, ly2, bannerH);
          if (p_sign_top1 && p_sign_top2) {
            // Pillars support
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = Math.max(1.2, 70 / p_l1.depth);
            ctx.beginPath();
            ctx.moveTo(p_l1.x, p_l1.y);
            ctx.lineTo(p_sign_top1.x, p_sign_top1.y);
            ctx.stroke();
            
            // Colored neon canvas barrier signboards
            ctx.fillStyle = (idx % 30 === 0) ? '#ff3e00' : '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(p_sign_top1.x, p_sign_top1.y);
            ctx.lineTo(p_sign_top2.x, p_sign_top2.y);
            ctx.lineTo(p_l2.x, p_l2.y - Math.max(3, 40/p_l1.depth));
            ctx.lineTo(p_l1.x, p_l1.y - Math.max(3, 40/p_l1.depth));
            ctx.closePath();
            ctx.fill();
            
            // Draw small arrows overlay matching curves
            ctx.fillStyle = '#ffffff';
            ctx.font = `${Math.max(4, 32 / p_l1.depth)}px font-mono`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('>>>', (p_sign_top1.x + p_sign_top2.x)/2, (p_sign_top1.y + p_sign_top2.y)/2);
          }
        }
      }

      // 6. Draw Sports Car chassis body using complete 3D Projection Model
      const carW = 16.5;       // Wide, muscular GT-R body width
      const carL = 25.0;       // Aggressive aerodynamic chassis length
      
      // Compute 3D corners relative to car heading
      const rL_x = state.x - cosA * (carL / 2) + (-sinA) * (carW / 2);
      const rL_y = state.y - sinA * (carL / 2) + cosA * (carW / 2);
      const rR_x = state.x - cosA * (carL / 2) - (-sinA) * (carW / 2);
      const rR_y = state.y - sinA * (carL / 2) - cosA * (carW / 2);
      
      const fL_x = state.x + cosA * (carL / 2) + (-sinA) * (carW / 2);
      const fL_y = state.y + sinA * (carL / 2) + cosA * (carW / 2);
      const fR_x = state.x + cosA * (carL / 2) - (-sinA) * (carW / 2);
      const fR_y = state.y + sinA * (carL / 2) - cosA * (carW / 2);
      
      // Projects ground suspension & roof bounds
      const p_rL_b = project3D(rL_x, rL_y, 0.05);
      const p_rR_b = project3D(rR_x, rR_y, 0.05);
      const p_fL_b = project3D(fL_x, fL_y, 0.05);
      const p_fR_b = project3D(fR_x, fR_y, 0.05);
      
      const p_rL_t = project3D(rL_x, rL_y, 7.8);
      const p_rR_t = project3D(rR_x, rR_y, 7.8);
      const p_fL_t = project3D(fL_x, fL_y, 5.2);
      const p_fR_t = project3D(fR_x, fR_y, 5.2);
      
      if (
        p_rL_b && p_rR_b && p_fL_b && p_fR_b && 
        p_rL_t && p_rR_t && p_fL_t && p_fR_t
      ) {
        ctx.save();
        
        // Under-wheel shadow black gradient
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.moveTo(p_rL_b.x - 5, p_rL_b.y);
        ctx.lineTo(p_rR_b.x + 5, p_rR_b.y);
        ctx.lineTo(p_fR_b.x + 5, p_fR_b.y);
        ctx.lineTo(p_fL_b.x - 5, p_fL_b.y);
        ctx.closePath();
        ctx.fill();

        // High gloss metallic reflection shader paint formula
        const getMetallicStyle = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
          const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          grad.addColorStop(0, '#53637e'); // shadowed metallic gray
          grad.addColorStop(0.22, carColor); // specular body metallic color
          grad.addColorStop(0.48, '#ffffff'); // bright silver glint highlight
          grad.addColorStop(0.72, carColor);
          grad.addColorStop(1, '#2c3340'); // edge dark titanium plate shading
          return grad;
        };

        // Left aerodynamic panels
        ctx.fillStyle = getMetallicStyle(p_rL_b, p_fL_t);
        ctx.beginPath();
        ctx.moveTo(p_rL_b.x, p_rL_b.y);
        ctx.lineTo(p_fL_b.x, p_fL_b.y);
        ctx.lineTo(p_fL_t.x, p_fL_t.y);
        ctx.lineTo(p_rL_t.x, p_rL_t.y);
        ctx.closePath();
        ctx.fill();
        
        // Right aerodynamic panels
        ctx.fillStyle = getMetallicStyle(p_rR_b, p_fR_t);
        ctx.beginPath();
        ctx.moveTo(p_rR_b.x, p_rR_b.y);
        ctx.lineTo(p_fR_b.x, p_fR_b.y);
        ctx.lineTo(p_fR_t.x, p_fR_t.y);
        ctx.lineTo(p_rR_t.x, p_rR_t.y);
        ctx.closePath();
        ctx.fill();
        
        // Massive Wide muscular GT-R back panel
        const rearBumperGrad = ctx.createLinearGradient(p_rL_b.x, p_rL_b.y, p_rR_t.x, p_rR_t.y);
        rearBumperGrad.addColorStop(0, '#4b5563');
        rearBumperGrad.addColorStop(0.3, carColor);
        rearBumperGrad.addColorStop(0.5, '#f9fafb'); // brilliant glint light stripe
        rearBumperGrad.addColorStop(0.7, carColor);
        rearBumperGrad.addColorStop(1, '#374151');
        
        ctx.fillStyle = rearBumperGrad;
        ctx.strokeStyle = '#020202';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(p_rL_b.x, p_rL_b.y);
        ctx.lineTo(p_rR_b.x, p_rR_b.y);
        ctx.lineTo(p_rR_t.x, p_rR_t.y);
        ctx.lineTo(p_rL_t.x, p_rL_t.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // R35 custom matte carbon bottom diffuser
        ctx.fillStyle = '#111113';
        ctx.beginPath();
        ctx.moveTo(p_rL_b.x, p_rL_b.y);
        ctx.lineTo(p_rR_b.x, p_rR_b.y);
        ctx.lineTo((p_rR_b.x * 2.1 + p_rL_b.x) / 3.1, p_rR_b.y + 4.5);
        ctx.lineTo((p_rL_b.x * 2.1 + p_rR_b.x) / 3.1, p_rL_b.y + 4.5);
        ctx.closePath();
        ctx.fill();

        // Authentic dual chrome twin exhaust pipes
        ctx.fillStyle = '#bfdbfe';
        ctx.strokeStyle = '#1e1b4b';
        ctx.lineWidth = 1;
        const exY_offset = (p_rL_b.y + p_rR_b.y)/2 + 1;
        
        const exL_pos1 = p_rL_b.x + (p_rR_b.x - p_rL_b.x) * 0.12;
        const exL_pos2 = p_rL_b.x + (p_rR_b.x - p_rL_b.x) * 0.19;
        ctx.beginPath(); ctx.arc(exL_pos1, exY_offset, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(exL_pos2, exY_offset, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        
        const exR_pos1 = p_rR_b.x - (p_rR_b.x - p_rL_b.x) * 0.12;
        const exR_pos2 = p_rR_b.x - (p_rR_b.x - p_rL_b.x) * 0.19;
        ctx.beginPath(); ctx.arc(exR_pos1, exY_offset, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(exR_pos2, exY_offset, 2.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        // Custom center-justified license plate with GTR text emblem
        const plateW = Math.min(24, Math.max(9, 270 / p_rL_b.depth));
        const plateH = Math.min(9, Math.max(3.5, 110 / p_rL_b.depth));
        const plateX = (p_rL_b.x + p_rR_b.x)/2 - plateW/2;
        const plateY = (p_rL_b.y + p_rR_b.y)/2 - 11;
        ctx.fillStyle = '#09090b';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.2;
        ctx.fillRect(plateX, plateY, plateW, plateH);
        ctx.strokeRect(plateX, plateY, plateW, plateH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(plateX + 1.2, plateY + 1.2, plateW - 2.4, plateH - 2.4);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = `bold ${plateH - 1.5}px font-mono`;
        ctx.textAlign = 'center';
        ctx.fillText('GT-R', plateX + plateW/2, plateY + plateH - 2);

        // Sleek translucent cockpit sun roof windshield canopy
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.beginPath();
        ctx.moveTo(p_rL_t.x, p_rL_t.y);
        ctx.lineTo(p_rR_t.x, p_rR_t.y);
        ctx.lineTo(p_fR_t.x, p_fR_t.y);
        ctx.lineTo(p_fL_t.x, p_fL_t.y);
        ctx.closePath();
        ctx.fill();
        
        // Window reflective gloss glint shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo((p_rL_t.x * 2 + p_rR_t.x)/3, (p_rL_t.y * 2 + p_rR_t.y)/3);
        ctx.lineTo((p_rR_t.x * 2 + p_rL_t.x)/3, (p_rR_t.y * 2 + p_rL_t.y)/3);
        ctx.lineTo((p_fR_t.x * 2 + p_fL_t.x)/3, (p_fR_t.y * 2 + p_fL_t.y)/3);
        ctx.lineTo((p_fL_t.x * 2 + p_fR_t.x)/3, (p_fL_t.y * 2 + p_fR_t.y)/3);
        ctx.closePath();
        ctx.fill();
        
        // Iconic Nissan GT-R twin circular dual core LED rings lights
        const isBraking = inputs.backward || inputs.handbrake;
        ctx.shadowBlur = isBraking ? 20 : 6;
        ctx.shadowColor = '#ff1100';
        
        const drawDoubleRingLight = (midX: number, midY: number, size: number) => {
          ctx.strokeStyle = isBraking ? '#ff1e00' : '#8a0a00';
          ctx.lineWidth = isBraking ? 2.5 : 1.2;
          ctx.fillStyle = isBraking ? '#ff3200' : '#cc1100';
          
          // Outer Ring Circle
          ctx.beginPath();
          ctx.arc(midX - size * 0.45, midY, size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fill();
          
          ctx.fillStyle = '#131317';
          ctx.beginPath();
          ctx.arc(midX - size * 0.45, midY, size * 0.22, 0, Math.PI * 2);
          ctx.fill();

          // Inner Ring Circle
          ctx.fillStyle = isBraking ? '#ff3200' : '#cc1100';
          ctx.beginPath();
          ctx.arc(midX + size * 0.45, midY, size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fill();
          
          ctx.fillStyle = '#131317';
          ctx.beginPath();
          ctx.arc(midX + size * 0.45, midY, size * 0.22, 0, Math.PI * 2);
          ctx.fill();
        };

        const tSize = Math.min(7.5, Math.max(2.0, 110 / p_rL_b.depth));
        const l_light_x = p_rL_b.x + (p_rR_b.x - p_rL_b.x) * 0.22;
        const l_light_y = (p_rL_b.y + p_rL_t.y)/2 - 5;
        const r_light_x = p_rR_b.x - (p_rR_b.x - p_rL_b.x) * 0.22;
        const r_light_y = (p_rR_b.y + p_rR_t.y)/2 - 5;

        drawDoubleRingLight(l_light_x, l_light_y, tSize);
        drawDoubleRingLight(r_light_x, r_light_y, tSize);
        
        ctx.shadowBlur = 0; // reset
        
        // Dynamic exhaust fire flare engine combustion spark
        if (inputs.forward && localSpeedKmh > 10) {
          ctx.fillStyle = Math.random() > 0.45 ? '#ff7300' : '#ff1e00';
          const firePosX = Math.random() > 0.5 ? exL_pos1 : exR_pos1;
          ctx.beginPath();
          ctx.arc(firePosX, exY_offset + 2, Math.random() * 5.5 + 3, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Beautiful racing wide aerodynamics aerodynamic spoiler wing
        ctx.strokeStyle = '#050508';
        ctx.lineWidth = 2.4;
        // Two support posts
        ctx.beginPath();
        ctx.moveTo(p_rL_t.x + 1.2, p_rL_t.y);
        ctx.lineTo(p_rL_t.x + 1.2, p_rL_t.y - 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p_rR_t.x - 1.2, p_rR_t.y);
        ctx.lineTo(p_rR_t.x - 1.2, p_rR_t.y - 10);
        ctx.stroke();
        
        // Spoiler blade cross piece
        ctx.fillStyle = '#0f1115';
        ctx.beginPath();
        ctx.moveTo(p_rL_t.x - 4, p_rL_t.y - 11);
        ctx.lineTo(p_rR_t.x + 4, p_rR_t.y - 11);
        ctx.lineTo(p_rR_t.x + 3, p_rR_t.y - 7.5);
        ctx.lineTo(p_rL_t.x - 3, p_rL_t.y - 7.5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      }

      // --- WATER PARTICLES WEATHER OVERLAY SCREEN EFFECTS ---
      if (weather === 'Rainy' || weather === 'Snowy') {
        ctx.fillStyle = weather === 'Rainy' ? 'rgba(96, 165, 250, 0.45)' : '#ffffff';
        for (const pt of weatherParticles) {
          ctx.beginPath();
          if (weather === 'Rainy') {
            ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // fluffy snow crystal star
            ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
            ctx.fill();
          }

          // Advance weather vector
          pt.x += pt.vx;
          pt.y += pt.vy;

          if (pt.y > canvas.height) pt.y = 0;
          if (pt.x < 0) pt.x = canvas.width;
          if (pt.x > canvas.width) pt.x = 0;
        }
      }

      // --- COCKPIT SPEED & OVERVIEW overlay elements only when playing is active ---
      if (isPlaying) {
        // --- DRAW 2D TRACK LOOP MINIMAP IN BOTTOM-LEFT ---
        const mapX = 20;
        const mapY = 430;
        const mapW = 155;
        const mapH = 150;
        
        ctx.save();
        // Transparent box glass background panel
        ctx.fillStyle = 'rgba(7, 7, 10, 0.75)';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mapX, mapY, mapW, mapH, 12);
        ctx.fill();
        ctx.stroke();
        
        // Minimap Title text label
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 9px font-mono';
        ctx.textAlign = 'left';
        ctx.fillText(route.toUpperCase(), mapX + 12, mapY + 18);
        
        // Boundaries mapping parameters
        const minX = 50, maxX = 850;
        const minY = 100, maxY = 550;
        const sX = 115 / (maxX - minX);
        const sY = 95 / (maxY - minY);
        
        const toMini = (wx: number, wy: number) => ({
          mx: mapX + 20 + (wx - minX) * sX,
          my: mapY + 35 + (wy - minY) * sY
        });
        
        // Draw miniature circuit wire outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        densePoints.forEach((pt, dIdx) => {
          const { mx, my } = toMini(pt.x, pt.y);
          if (dIdx === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        });
        ctx.closePath();
        ctx.stroke();
        
        // Draw checkpoint markers on map
        activeTrack.checkpoints.forEach((checkpoint, dIdx) => {
          const { mx, my } = toMini(checkpoint.x, checkpoint.y);
          ctx.fillStyle = dIdx === nextCheckpointIdx ? '#22c55e' : 'rgba(255, 255, 255, 0.45)';
          ctx.beginPath();
          ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
          ctx.fill();
        });
        
        // Draw Orange tracking dot representing the car
        const { mx: carMx, my: carMy } = toMini(state.x, state.y);
        ctx.fillStyle = '#ff4d00';
        ctx.beginPath();
        ctx.arc(carMx, carMy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();

        // --- DRAW GLOWING ANALOG SPEEDOMETER DIAL GAUGE IN BOTTOM-RIGHT ---
        const gaugeX = 770;
        const gaugeY = 480;
        const gaugeR = 85;

        ctx.save();
        // Dial deep backup glass screen
        ctx.fillStyle = 'rgba(7, 7, 10, 0.78)';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, gaugeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Numeric Speed indexes ticks sweep
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let s = 0; s <= 210; s += 30) {
          const pct = s / 210;
          const tickAngle = Math.PI * 0.75 + pct * (Math.PI * 1.5);
          const cT = Math.cos(tickAngle);
          const sT = Math.sin(tickAngle);
          
          // Draw tick lines
          ctx.strokeStyle = s > 150 ? '#ff3200' : 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(gaugeX + cT * (gaugeR - 12), gaugeY + sT * (gaugeR - 12));
          ctx.lineTo(gaugeX + cT * (gaugeR - 4), gaugeY + sT * (gaugeR - 4));
          ctx.stroke();

          // Numbers indices labels
          ctx.fillStyle = s > 150 ? '#ff3200' : '#94a3b8';
          ctx.font = 'bold 9px font-mono';
          ctx.fillText(s.toString(), gaugeX + cT * (gaugeR - 22), gaugeY + sT * (gaugeR - 22));
        }

        // Ticking Needle sweep formula
        const speedPercent = Math.min(1.0, localSpeedKmh / 210);
        const needleAngle = Math.PI * 0.75 + speedPercent * (Math.PI * 1.5);
        const needleCos = Math.cos(needleAngle);
        const needleSin = Math.sin(needleAngle);

        // Under Needle Drop-Shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4.0;
        ctx.beginPath();
        ctx.moveTo(gaugeX, gaugeY);
        ctx.lineTo(gaugeX + needleCos * (gaugeR - 12) + 2, gaugeY + needleSin * (gaugeR - 12) + 2);
        ctx.stroke();

        // Radiant Crimson Needle Pointer
        ctx.strokeStyle = '#ff3c00';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(gaugeX, gaugeY);
        ctx.lineTo(gaugeX + needleCos * (gaugeR - 10), gaugeY + needleSin * (gaugeR - 10));
        ctx.stroke();

        // Hub lock Cap
        ctx.fillStyle = '#111115';
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff3c00';
        ctx.beginPath();
        ctx.arc(gaugeX, gaugeY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Large Gear selection center box
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 23px font-mono';
        ctx.textAlign = 'center';
        ctx.fillText(localGear.toString(), gaugeX, gaugeY + 30);
        ctx.fillStyle = '#ff3c00';
        ctx.font = 'bold 8px font-mono';
        ctx.fillText('GEAR', gaugeX, gaugeY + 45);

        // Digit Speed metric display
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px font-mono';
        ctx.fillText(`${Math.round(localSpeedKmh)}`, gaugeX, gaugeY - 32);
        ctx.fillStyle = '#64748b';
        ctx.font = '8px font-mono';
        ctx.fillText('KM/H', gaugeX, gaugeY - 22);
        
        ctx.restore();
      }

      animFrameId = requestAnimationFrame(gameLoop);
    };

    animFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, physicsParams, weather, route, carColor, audioActive]);

  const resetManual = () => {
    const initializedTrack = TRACKS_DATA[route];
    const state = carStateRef.current;
    state.x = initializedTrack.startPos.x;
    state.y = initializedTrack.startPos.y;
    state.angle = initializedTrack.startPos.angle;
    state.vx = 0;
    state.vy = 0;
    state.angularVelocity = 0;
    state.isFirstCheckpointPassed = false;
    state.driftAccumulator = 0;
    state.tireTracks = [];
    setNextCheckpointIdx(0);
    setLapTimer(0);
    setDriftPoints(0);
    setSpeedKmh(0);
    setIsDrifting(false);
  };

  const getFrictionLabel = () => {
    if (frictionCoefficient > 0.9) return 'Ideal Grid (Dynamic Asphalt)';
    if (frictionCoefficient > 0.6) return 'Damp Aquaplaning (Wet Runway)';
    if (frictionCoefficient > 0.45) return 'Medium Slide (Sahara Loose Sand)';
    return 'Extreme Slippery (Arctic Glacier)';
  };

  const formatTimer = (sec: number) => {
    const minStr = Math.floor(sec / 60);
    const secStr = Math.floor(sec % 60);
    const hundredthsStr = Math.floor((sec % 1) * 100);
    return `${minStr}:${secStr.toString().padStart(2, '0')}.${hundredthsStr.toString().padStart(2, '0')}`;
  };

  return (
    <div id="simulator_container" className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl">
      {/* Simulation Header with Quick metadata */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide font-sans flex items-center gap-2">
            <span className="p-1 px-2.5 bg-rose-600 rounded text-xs font-mono tracking-widest uppercase">Forza Physics</span>
            Forza Car Racing Live Sandbox
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Surface Slip Index: <span className="text-amber-400">μ = {frictionCoefficient.toFixed(2)}</span> ({getFrictionLabel()})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              onClick={startEngine}
              id="start_engine_btn"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 hover:text-white font-bold text-sm tracking-widest rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95 uppercase font-sans"
            >
              <Power className="w-4 h-4" /> Start Engine
            </button>
          ) : (
            <>
              <button
                onClick={resetManual}
                id="reset_sim_btn"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg hover:text-white transition-all active:scale-95"
                title="Reset Race Tracker"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowTouchControls(!showTouchControls)}
                id="controls_overlay_toggle_btn"
                className={`p-2.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 ${
                  showTouchControls 
                    ? 'bg-rose-950/30 border-rose-800/40 text-rose-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title={showTouchControls ? 'Hide Virtual HUD Controls' : 'Show Virtual HUD Controls'}
              >
                <Keyboard className="w-4 h-4" />
                <span className="text-[10px] font-mono font-bold tracking-widest hidden sm:inline">
                  TOUCH HUD ({showTouchControls ? 'ON' : 'OFF'})
                </span>
              </button>
              <button
                onClick={toggleMute}
                id="audio_toggle_btn"
                className={`p-2.5 rounded-lg border transition-all active:scale-95 ${
                  isMuted 
                    ? 'bg-rose-950/30 border-rose-800/40 text-rose-400' 
                    : 'bg-indigo-950/20 border-indigo-800/40 text-indigo-400'
                }`}
                title={isMuted ? 'Unmute' : 'Mute Engine'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative border border-slate-800 bg-slate-900/20 rounded-xl overflow-hidden shadow-inner flex flex-col items-center justify-center">
        {/* Actual Dynamic HUD overlays */}
        {isPlaying && (
          <>
            {/* Top-Left: Lap Tracker Skew block */}
            <div className="absolute top-4 left-4 z-10 bg-black/92 border border-slate-800 p-2.5 px-4 rounded shadow-2xl skew-x-[-5deg] select-none text-left">
              <div className="text-[9px] font-mono font-black text-[#FF3E00] uppercase tracking-wider">
                LAP
              </div>
              <div className="text-2xl font-black font-mono text-white italic tracking-tighter leading-none mt-1">
                {nextCheckpointIdx === 0 ? '1' : Math.ceil((nextCheckpointIdx + 1) / 2)} <span className="text-xs font-normal text-slate-500">/ 3</span>
              </div>
            </div>

            {/* Top-Center: Race Time Counter Glass Panel */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/92 border border-slate-800 p-2.5 px-6 rounded shadow-2xl text-center min-w-[145px] select-none">
              <div className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                RACE TIME
              </div>
              <div id="hud-racetime-val" className="text-xl font-mono font-bold text-white tracking-widest mt-0.5">
                {formatTimer(lapTimer)}
              </div>
            </div>

            {/* Top-Right: Route Coordinates & Car Type Detail */}
            <div className="absolute top-4 right-4 z-10 bg-black/92 border border-slate-800 p-2.5 px-4 rounded shadow-2xl text-right max-w-[210px] select-none">
              <div className="text-[10px] font-mono font-black text-cyan-400 uppercase tracking-widest truncate">
                {route.toUpperCase()}
              </div>
              <div className="text-xs font-bold font-sans text-white mt-0.5 uppercase truncate">
                {carName}
              </div>
              <div className="flex gap-1.5 justify-end items-center mt-1.5">
                {[1, 2, 3, 4].map((dot) => {
                  const diffLevel = track.difficulty === 'Easy' ? 1 : track.difficulty === 'Medium' ? 2 : track.difficulty === 'Hard' ? 3 : 4;
                  return (
                    <div 
                      key={dot} 
                      className={`w-1.5 h-1.5 rounded-full ${
                        dot <= diffLevel ? 'bg-[#FF3E00] shadow-[0_0_5px_#FF3E00]' : 'bg-[#222222]'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Real-time Drift Point Combos popup indicator */}
            {driftPoints > 0 && (
              <div className="absolute top-18 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center justify-center pointer-events-none select-none">
                <div className={`text-xs font-mono font-black italic tracking-widest uppercase transition-all flex items-center gap-1 bg-black/85 px-3 py-1 border border-rose-950 rounded-full shadow-lg ${
                  isDrifting ? 'text-rose-400 scale-105 animate-pulse' : 'text-slate-400 scale-95'
                }`}>
                  <Flame className="w-3.5 h-3.5 text-rose-500" /> DRIFT SCORE
                </div>
                <div className="text-xl font-bold font-mono text-white tracking-wider mt-1 drop-shadow-md">
                  <span id="hud-drift-val">{driftPoints}</span> <span className="text-xs text-rose-500 font-bold">PTS</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Action instruction overlaid when not playing */}
        {!isPlaying && (
          <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
            <Compass className="w-12 h-12 text-rose-600 animate-spin mb-3" style={{ animationDuration: '6s' }} />
            <span className="text-[10px] font-mono uppercase bg-rose-950/40 border border-rose-800/30 text-rose-400 px-2 py-0.5 rounded tracking-widest mb-2">
              Competitive Sim Start
            </span>
            <h3 className="text-lg font-bold text-white tracking-wide font-sans mb-1">Press Start Engine</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              Ignite the cylinders and drive the high-fidelity <strong>{carName}</strong> around the 3D track coordinate gates using your keyboard.
            </p>
            <div className="flex gap-4 p-4 border border-slate-800 bg-slate-900/60 rounded-lg text-left text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-indigo-400" />
                <div>
                  <div className="text-white font-semibold">WASD / Arrow Keys</div>
                  <div>Power / Turn Wheels</div>
                </div>
              </div>
              <div className="border-l border-slate-800" />
              <div>
                <div className="text-white font-semibold">SPACEBAR</div>
                <div>Lock Rear Tires (Drift Glide)</div>
              </div>
            </div>
          </div>
        )}

        {/* The Racing canvas element */}
        <canvas
          ref={canvasRef}
          width={900}
          height={600}
          className="w-full h-auto aspect-[3/2] block cursor-crosshair bg-[#0f172a]"
        />

        {/* Absolute Floating On-Screen Controls for Mobile / Touch & Manual toggle */}
        {showTouchControls && isPlaying && (
          <div className="absolute inset-x-0 bottom-4 pointer-events-none flex justify-between px-4 z-10 select-none">
            {/* LEFT SIDE: Steering Controls */}
            <div className="flex gap-3 pointer-events-auto">
              {/* Steer Left Button */}
              <button
                id="virtual_btn_left"
                onTouchStart={(e) => {
                  e.preventDefault();
                  inputsRef.current.left = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  inputsRef.current.left = false;
                }}
                onMouseDown={() => {
                  inputsRef.current.left = true;
                }}
                onMouseUp={() => {
                  inputsRef.current.left = false;
                }}
                onMouseLeave={() => {
                  inputsRef.current.left = false;
                }}
                className="w-16 h-16 bg-[#111]/80 hover:bg-[#1A1A1A]/95 border-2 border-[#333] active:border-[#FF3E00] active:text-[#FF3E00] text-slate-300 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all font-black font-mono select-none pointer-events-auto cursor-pointer"
              >
                <span className="text-2xl font-black">◀</span>
              </button>

              {/* Steer Right Button */}
              <button
                id="virtual_btn_right"
                onTouchStart={(e) => {
                  e.preventDefault();
                  inputsRef.current.right = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  inputsRef.current.right = false;
                }}
                onMouseDown={() => {
                  inputsRef.current.right = true;
                }}
                onMouseUp={() => {
                  inputsRef.current.right = false;
                }}
                onMouseLeave={() => {
                  inputsRef.current.right = false;
                }}
                className="w-16 h-16 bg-[#111]/80 hover:bg-[#1A1A1A]/95 border-2 border-[#333] active:border-[#FF3E00] active:text-[#FF3E00] text-slate-300 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all font-black font-mono select-none pointer-events-auto cursor-pointer"
              >
                <span className="text-2xl font-black">▶</span>
              </button>
            </div>

            {/* RIGHT SIDE: Pedals & Handbrake */}
            <div className="flex items-end gap-3 pointer-events-auto">
              {/* HANDBRAKE / DRIFT */}
              <button
                id="virtual_btn_drift"
                onTouchStart={(e) => {
                  e.preventDefault();
                  inputsRef.current.handbrake = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  inputsRef.current.handbrake = false;
                }}
                onMouseDown={() => {
                  inputsRef.current.handbrake = true;
                }}
                onMouseUp={() => {
                  inputsRef.current.handbrake = false;
                }}
                onMouseLeave={() => {
                  inputsRef.current.handbrake = false;
                }}
                className="w-14 h-14 bg-[#FF3E00]/20 hover:bg-[#FF3E00]/30 border-2 border-[#FF3E00]/40 active:border-[#FF3E00] active:bg-[#FF3E00]/40 text-[#FF3E00] rounded-full flex flex-col items-center justify-center shadow-lg active:scale-90 transition-all text-[9px] font-mono leading-tight tracking-tighter select-none pointer-events-auto cursor-pointer"
              >
                <Flame className="w-5 h-5 text-[#FF3E00] mb-0.5" />
                <span>DRIFT</span>
              </button>

              {/* REVERSE / BRAKE Pedal */}
              <button
                id="virtual_btn_brake"
                onTouchStart={(e) => {
                  e.preventDefault();
                  inputsRef.current.backward = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  inputsRef.current.backward = false;
                }}
                onMouseDown={() => {
                  inputsRef.current.backward = true;
                }}
                onMouseUp={() => {
                  inputsRef.current.backward = false;
                }}
                onMouseLeave={() => {
                  inputsRef.current.backward = false;
                }}
                className="w-16 h-24 bg-red-500/10 hover:bg-red-500/20 border-2 border-red-500/40 active:border-red-500 active:bg-red-500/30 text-red-500 rounded-md flex flex-col items-center justify-center shadow-lg active:scale-90 transition-all text-[10px] font-mono select-none pointer-events-auto cursor-pointer"
              >
                <span className="text-xs uppercase font-black tracking-widest leading-none mb-2">BRAKE</span>
                <span className="text-lg">▼</span>
              </button>

              {/* THROTTLE / ACCEL Pedal */}
              <button
                id="virtual_btn_accel"
                onTouchStart={(e) => {
                  e.preventDefault();
                  inputsRef.current.forward = true;
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  inputsRef.current.forward = false;
                }}
                onMouseDown={() => {
                  inputsRef.current.forward = true;
                }}
                onMouseUp={() => {
                  inputsRef.current.forward = false;
                }}
                onMouseLeave={() => {
                  inputsRef.current.forward = false;
                }}
                className="w-18 h-28 bg-emerald-500/10 hover:bg-emerald-500/20 border-2 border-emerald-500/40 active:border-emerald-500 active:bg-emerald-500/30 text-emerald-500 rounded-md flex flex-col items-center justify-center shadow-lg active:scale-90 transition-all text-xs font-mono select-none pointer-events-auto cursor-pointer"
              >
                <span className="text-[11px] uppercase font-bold tracking-widest leading-none mb-3 font-mono">DRIVE</span>
                <span className="text-xl">▲</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Cockpit HUD controls Bar */}
        <div className="w-full bg-slate-900 border-t border-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 items-center justify-between gap-4">
          {/* Gauges Speed meter */}
          <div className="flex items-center gap-3">
            <div className="p-2 border border-slate-800 bg-slate-950 rounded-lg flex items-center justify-center">
              <Gauge className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-mono uppercase">Velocity INDEX</div>
              <div className="font-mono text-xl font-black text-white leading-none">
                <span id="hud-speedometer-val">{speedKmh}</span> <span className="text-xs font-normal text-slate-400 font-sans">km/h</span>
              </div>
            </div>
          </div>

          {/* RPM Dial Simulation */}
          <div>
            <div className="text-[10px] text-slate-500 font-mono uppercase truncate">Cylinder RPM</div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-sm text-slate-200 mt-1 flex-1">
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-950 mt-1">
                  <div 
                    id="hud-rpm-bar"
                    className={`h-full transition-none duration-0 ${
                      rpm > 6800 ? 'bg-rose-500 animate-pulse' : rpm > 4500 ? 'bg-amber-400' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${(rpm / 8000) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-0.5 font-mono">
                  <span>800 idle</span>
                  <span id="hud-rpm-text">{rpm} RPM</span>
                  <span className="text-rose-500 font-bold">7.8k Limit</span>
                </div>
              </div>
            </div>
          </div>

          {/* Drivetrain Gears indicator */}
          <div className="text-center md:text-left">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Interactive Gearbox</div>
            <div className="text-lg font-mono font-bold text-slate-100 flex items-center justify-center md:justify-start gap-1">
              <span className="p-1 px-2.5 bg-slate-950 rounded text-indigo-400 border border-slate-800 text-sm">
                Gear <span id="hud-gear-val">{gear}</span>
              </span>
              <span className="text-[10px] font-normal text-slate-400 uppercase font-mono mt-1">Automatic</span>
            </div>
          </div>

          {/* Drift Status bar */}
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-mono uppercase">Lateral Slip Ratio</div>
            <div className="flex items-center justify-end gap-1.5 mt-1">
              <span className={`text-xs font-mono px-2 py-0.5 rounded font-bold tracking-wide uppercase ${
                isDrifting ? 'bg-rose-950 text-rose-400 animate-bounce' : 'bg-slate-950 text-slate-500 border border-slate-800/80'
              }`}>
                {isDrifting ? 'DRIFT ZONE' : 'STABLE GRIP'}
              </span>
              <span className="font-mono text-xs font-semibold text-slate-300">
                {(activeDriftSlip * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Realistic suspension compression dynamic monitor widgets */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        {['FL', 'FR', 'RL', 'RR'].map((wheel) => {
          const load = wheelLoads[wheel as keyof typeof wheelLoads];
          const pct = Math.max(0, Math.min(100, (load / 1.8) * 100));
          return (
            <div key={wheel} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3">
              <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                <span className="text-slate-400 font-bold font-sans">Wheel {wheel} Load</span>
                <span className={load > 1.25 ? 'text-amber-400 font-bold' : load < 0.7 ? 'text-blue-400' : 'text-slate-400'}>
                  {load.toFixed(2)}G
                </span>
              </div>
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                <div 
                  className={`h-full transition-all duration-75 ${
                    load > 1.25 
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500' 
                      : load < 0.7 
                        ? 'bg-blue-500' 
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[9px] font-mono mt-1 text-slate-500 tracking-wide text-right">
                {load > 1.25 ? 'Suspension Compressed' : load < 0.7 ? 'Tension Drop (Lift)' : 'Nominal Travel'}
              </p>
            </div>
          );
        })}
      </div>

      {/* On-screen control guidance panel for mobile devices */}
      <div className="mt-4 flex flex-col md:flex-row gap-2 justify-between items-center p-3 bg-slate-900/30 border border-slate-800/40 rounded-lg text-slate-400 text-xs">
        <span className="flex items-center gap-1">
          <AlertCircle className="w-4 h-4 text-indigo-400" />
          Clicking inside the racetrack sandbox captures keyboard controls.
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          Developer Credit: <strong>Manish Kumar</strong>
        </span>
      </div>
    </div>
  );
}
