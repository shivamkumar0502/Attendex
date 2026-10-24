# Attendex — product and engineering case study

## Problem

Manual attendance interrupts teaching, while disconnected student lists and spreadsheets make follow-up difficult. Attendex gives teachers and students a shared class workflow with explicit review rather than silently turning a student response into a final record.

## Product flow

Teacher creates a class → shares an invitation/QR → student authenticates and joins → teacher opens a session → students submit check-ins → teacher reviews the register → attendance can be exported and explored in class insights.

A recruiter can try a fully labeled interactive demo from the landing page without creating an account. The demo uses local sample data and does not pollute the database.

## Engineering decisions

| Decision                                              | Reason                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| React + Vite frontend, Express API                    | Keep interactive workspaces and authorization separate while deploying from one origin.      |
| MongoDB sessions with TTL and compound unique indexes | Persist login state, clean expired sessions and prevent duplicate check-ins/active sessions. |
| Explicit pending attendance state                     | Preserve teacher control and make uncertainty visible.                                       |
| Browser-side model inference                          | Keep raw enrollment media local and reduce load on the small application server.             |
| AES-256-GCM template encryption                       | Protect stored descriptors with authenticated encryption and permit deletion.                |
| Opt-in comparison with manual fallback                | Device support and model performance must not block attendance access.                       |
| Separate sample-data demo                             | Make the project easy to assess without claiming real adoption.                              |

## What is implemented

Responsive workspaces, authentication, class invitation QR links, student directory, attendance review/export, classroom insights, camera/mic onboarding and experimental 1:1 face/ECAPA voice comparisons. The model signal is shown to teachers without automatically declaring a student present.

## Validation and honest limits

Automated tests exercise UI flows, permissions, encrypted storage, model tensor contracts and API access controls. Voice feature extraction was independently cross-checked using NumPy FFT. These are implementation checks, not population accuracy evaluations. Liveness/replay resistance, institutional provisioning, calibration, audit/retention policies and scale testing remain future work.

## Resume wording

Built Attendex, a full-stack classroom attendance platform using React, Express and MongoDB, with role-based workspaces, QR class invitations, reviewed check-ins and CSV reporting. Added opt-in browser-based face and ECAPA-TDNN voice embedding comparison with encrypted templates and teacher review; validated API/UI flows and ONNX model contracts.

Do not add invented adoption, latency, accuracy or time-saving numbers. Measure these in a consented pilot before making quantitative claims.
