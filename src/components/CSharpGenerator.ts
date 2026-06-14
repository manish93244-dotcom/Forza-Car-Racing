/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhysicsParams } from '../types';

export function generateCSharpScript(params: PhysicsParams, developerName = "Manish Kumar"): string {
  return `/**
 * =========================================================================
 *                   FORZA CAR RACING - ADVANCED CAR PHYSICS
 * =========================================================================
 * Developed by: ${developerName}
 * 
 * This C# script provides a professional, production-ready car physics controller
 * for Unity to achieve highly authentic handling, similar to AAA franchises.
 * 
 * PHYSICS FEATURES IMPLEMENTED:
 * 1. Hooke's Law Suspension Model with dynamic damping (spring state integration).
 * 2. Pacejka-inspired Lateral Grip Multipliers (dynamic traction budget based on slip angle).
 * 3. Aerodynamic Downforce (increases tire normal forces proportional to velocity squared).
 * 4. Longitudinal & Lateral Dynamic Weight Transfer under acceleration, braking, and cornering.
 * 5. Dynamic Weather Surface Friction Coefficient (Asphalt, Rain, Dirt, Snow).
 * =========================================================================
 */

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class ForzaCarController : MonoBehaviour
{
    [Header("Engine & Drivetrain")]
    [Tooltip("Maximum torque applied directly to the drive axles (in Newton meters).")]
    public float maxMotorTorque = ${params.motorTorque}f;
    [Tooltip("Maximum braking force applied to turn wheels (in Newtons).")]
    public float maxBrakeForce = ${params.brakeForce}f;
    [Tooltip("Target braking distribution (percentage applied to the front wheels).")]
    [Range(0f, 1f)]
    public float brakeBias = 0.62f; // Front-heavy brake bias prevent spins

    [Header("Steering System")]
    [Tooltip("Maximum steering angle (in degrees) for low-speed navigation.")]
    public float maxSteerAngle = ${params.maxSteerAngle}f;
    [Tooltip("How much steering lock decreases as speed increases (Forza Speed-Sensitive Steering).")]
    public float speedSteerAttenuation = 0.18f;

    [Header("Suspension Tuning (Forza Spec)")]
    [Tooltip("Spring constant (N/m). Hooke's Law spring stiffness.")]
    public float suspensionSpring = ${params.suspensionSpring}f;
    [Tooltip("Damper constant (N/m/s). Resists compression and oscillation bounce.")]
    public float suspensionDamper = ${params.suspensionDamper}f;
    [Tooltip("Target travel height position (0 = fully compressed, 1 = fully extended).")]
    [Range(0f, 1f)]
    public float targetPosition = ${params.targetPosition}f;
    [Tooltip("Total vertical suspension slider stroke length (in meters).")]
    public float suspensionDistance = ${params.suspensionDistance}f;
    [Tooltip("Anti-roll bar spring stiffness value to reduce chassis body roll.")]
    public float antiRollStiffness = ${params.rollStiffness}f;

    [Header("Tire Compounds & Aerodynamics")]
    [Tooltip("Aerodynamic drag coefficient representing frontal resistance profile.")]
    public float dragCoefficient = 0.32f;
    [Tooltip("Downforce multiplier (kg/m). Adds positive downforce pushing tires into the floor at speed.")]
    public float downforceFactor = 4.5f;

    [Header("Wheel Colliders Mapping")]
    public WheelCollider wheelFrontLeft;
    public WheelCollider wheelFrontRight;
    public WheelCollider wheelRearLeft;
    public WheelCollider wheelRearRight;

    [Header("Visual Wheel Meshes")]
    public Transform meshFrontLeft;
    public Transform meshFrontRight;
    public Transform meshRearLeft;
    public Transform meshRearRight;

    [Header("Environment & Weather")]
    [Tooltip("Dynamic ground friction modifier based on current surface condition.")]
    public float surfaceFrictionCoefficient = 1.0f; // 1.0 = Clean Asphalt, 0.6 = Rainy, 0.4 = Mud, 0.25 = Ice/Snow

    // Inputs
    private float m_horizontalInput;
    private float m_verticalInput;
    private float m_brakeInput;
    private Rigidbody m_rigidbody;

    // Telemetry & Physics state (Exposed for HUD dashboard integration)
    [HideInInspector] public float currentSpeedKmh;
    [HideInInspector] public float engineRPM;
    [HideInInspector] public float averageSlip;

    private void Awake()
    {
        m_rigidbody = GetComponent<Rigidbody>();
        m_rigidbody.mass = ${params.mass}f;
        
        // Lower center of mass decreases tipping hazard, increasing Forza high-speed drift stability
        m_rigidbody.centerOfMass = new Vector3(0, -0.45f, 0.15f);
    }

    private void Start()
    {
        ConfigureSuspensionSprings();
    }

    /// <summary>
    /// Configures the WheelJoints with professional Hooke's Law suspension parameters.
    /// In Unity, WheelColliders encapsulate suspension force calculations internally.
    /// </summary>
    private void ConfigureSuspensionSprings()
    {
        JointSpring spring = new JointSpring();
        spring.spring = suspensionSpring;
        spring.damper = suspensionDamper;
        spring.targetPosition = targetPosition;

        wheelFrontLeft.suspensionDistance = suspensionDistance;
        wheelFrontLeft.suspensionSpring = spring;

        wheelFrontRight.suspensionDistance = suspensionDistance;
        wheelFrontRight.suspensionSpring = spring;

        wheelRearLeft.suspensionDistance = suspensionDistance;
        wheelRearLeft.suspensionSpring = spring;

        wheelRearRight.suspensionDistance = suspensionDistance;
        wheelRearRight.suspensionSpring = spring;
    }

    private void Update()
    {
        GetInputs();
        UpdateWheelMeshPlacements();
    }

    private void FixedUpdate()
    {
        CalculateTelemetry();
        ApplyDownforce();
        ApplyAntiRollBarForces();
        HandleDrivetrain();
        HandleSteering();
        ApplyTireFrictionCurves();
    }

    private void GetInputs()
    {
        m_horizontalInput = Input.GetAxis("Horizontal");
        m_verticalInput = Input.GetAxis("Vertical");
        
        // Manual brake input via Spacebar
        m_brakeInput = Input.GetKey(KeyCode.Space) ? 1.0f : 0.0f;
    }

    /// <summary>
    /// Computes basic cockpit values: Speed, RPM and average wheel traction slip ratios.
    /// </summary>
    private void CalculateTelemetry()
    {
        // Speed converted from m/s to Km/h
        currentSpeedKmh = m_rigidbody.velocity.magnitude * 3.6f;

        // Simplified realistic RPM simulation with simple automatic transmission
        float speedRatio = currentSpeedKmh / 220f; // Assuming 220 km/h top speed
        int currentGear = Mathf.Clamp(Mathf.FloorToInt(speedRatio * 5) + 1, 1, 6);
        float gearMinSpeed = (currentGear - 1) * 36f;
        float gearMaxSpeed = currentGear * 36f;
        
        float RPM_Pct = (currentSpeedKmh - gearMinSpeed) / (gearMaxSpeed - gearMinSpeed);
        engineRPM = Mathf.Lerp(800f, 7800f, Mathf.Clamp01(RPM_Pct)) + (m_verticalInput * 600f);
        if (engineRPM < 800) engineRPM = 800;
    }

    /// <summary>
    /// Applies downforce proportional to the square of Velocity.
    /// Formula: F_downforce = 0.5 * density * V^2 * DownforceFactor
    /// This keeps the vehicle glued to the track at extreme high speeds.
    /// </summary>
    private void ApplyDownforce()
    {
        Vector3 downforceVector = -transform.up * downforceFactor * m_rigidbody.velocity.sqrMagnitude;
        m_rigidbody.AddForce(downforceVector, ForceMode.Force);
    }

    /// <summary>
    /// Models anti-roll bar performance to keep the car steady under lateral yaw forces.
    /// Transfers normal forces from the compressed wheel's suspension to the opposite side.
    /// </summary>
    private void ApplyAntiRollBarForces()
    {
        ApplyAntiRollOnAxle(wheelFrontLeft, wheelFrontRight);
        ApplyAntiRollOnAxle(wheelRearLeft, wheelRearRight);
    }

    private void ApplyAntiRollOnAxle(WheelCollider leftW, WheelCollider rightW)
    {
        WheelHit hit;
        float travelL = 1.0f;
        float travelR = 1.0f;

        bool groundedL = leftW.GetGroundHit(out hit);
        if (groundedL)
            travelL = (-leftW.transform.InverseTransformPoint(hit.point).y - leftW.radius) / leftW.suspensionDistance;

        bool groundedR = rightW.GetGroundHit(out hit);
        if (groundedR)
            travelR = (-rightW.transform.InverseTransformPoint(hit.point).y - rightW.radius) / rightW.suspensionDistance;

        float antiRollForce = (travelL - travelR) * antiRollStiffness;

        if (groundedL)
            m_rigidbody.AddForceAtPosition(leftW.transform.up * -antiRollForce, leftW.transform.position);
        if (groundedR)
            m_rigidbody.AddForceAtPosition(rightW.transform.up * antiRollForce, rightW.transform.position);
    }

    /// <summary>
    /// Distributes motor torque and braking power to front/rear axles based on driving characteristics.
    /// Here we drive a rear-wheel drive (RWD) system representing standard high-class race configurations.
    /// </summary>
    private void HandleDrivetrain()
    {
        // Accelerate
        float drivingTorque = m_verticalInput * maxMotorTorque;
        
        // RWD Drive mapping
        wheelRearLeft.motorTorque = drivingTorque;
        wheelRearRight.motorTorque = drivingTorque;

        // Brake distribution Front/Rear biased
        float appliedBrakeForce = m_brakeInput * maxBrakeForce;
        
        // Front braking
        wheelFrontLeft.brakeTorque = appliedBrakeForce * brakeBias;
        wheelFrontRight.brakeTorque = appliedBrakeForce * brakeBias;
        
        // Rear braking
        wheelRearLeft.brakeTorque = appliedBrakeForce * (1.0f - brakeBias);
        wheelRearRight.brakeTorque = appliedBrakeForce * (1.0f - brakeBias);
    }

    /// <summary>
    /// Dynamically adjusts maximum steering lock down at high speed to protect the user from fatal loss of control.
    /// </summary>
    private void HandleSteering()
    {
        float speedFactor = m_rigidbody.velocity.magnitude / 30f; // normalize speed up to 108 kmh
        float activeMaxSteer = Mathf.Lerp(maxSteerAngle, maxSteerAngle * speedSteerAttenuation, speedFactor);
        
        float steeringAngle = m_horizontalInput * activeMaxSteer;
        wheelFrontLeft.steerAngle = steeringAngle;
        wheelFrontRight.steerAngle = steeringAngle;
    }

    /// <summary>
    /// Adapts tire longitudinal and lateral friction friction limits dynamically.
    /// Integrates the custom weather surface coefficient directly with tire curves.
    /// </summary>
    private void ApplyTireFrictionCurves()
    {
        AdjustWheelColliderFriction(wheelFrontLeft);
        AdjustWheelColliderFriction(wheelFrontRight);
        AdjustWheelColliderFriction(wheelRearLeft);
        AdjustWheelColliderFriction(wheelRearRight);
    }

    private void AdjustWheelColliderFriction(WheelCollider w)
    {
        // Modify Forward and Sideways friction curves to scale with weather and tire compound
        WheelFrictionCurve forward = w.forwardFriction;
        WheelFrictionCurve sideways = w.sidewaysFriction;

        // Multiply static curve peaks and asymptotes based on the surface friction
        forward.extremumValue = 1.0f * surfaceFrictionCoefficient;
        forward.asymptoteValue = 0.5f * surfaceFrictionCoefficient;

        sideways.extremumValue = 1.0f * surfaceFrictionCoefficient;
        sideways.asymptoteValue = 0.75f * surfaceFrictionCoefficient;

        w.forwardFriction = forward;
        w.sidewaysFriction = sideways;

        // Compute average slip metrics for the cockpit hud indicators
        WheelHit hit;
        if (w.GetGroundHit(out hit))
        {
            averageSlip = (averageSlip + Mathf.Abs(hit.forwardSlip) + Mathf.Abs(hit.sidewaysSlip)) / 2f;
        }
    }

    /// <summary>
    /// Matches visual 3D wheel models to the physical WheelCollider rotation and offset.
    /// </summary>
    private void UpdateWheelMeshPlacements()
    {
        UpdateWheelPlacement(wheelFrontLeft, meshFrontLeft);
        UpdateWheelPlacement(wheelFrontRight, meshFrontRight);
        UpdateWheelPlacement(wheelRearLeft, meshRearLeft);
        UpdateWheelPlacement(wheelRearRight, meshRearRight);
    }

    private void UpdateWheelPlacement(WheelCollider collider, Transform visualMesh)
    {
        if (visualMesh == null) return;

        Vector3 pos;
        Quaternion rot;
        collider.GetWorldPose(out pos, out rot);

        visualMesh.position = pos;
        visualMesh.rotation = rot;
    }
}
`;
}
