import React from "react";
import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import { ThemeProvider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "@aws-amplify/ui-react-liveness/styles.css";
export default function LivenessCheck({ session, onComplete, onError }) {
  return (
    <ThemeProvider>
      <FaceLivenessDetectorCore
        sessionId={session.sessionId}
        region={session.region}
        onAnalysisComplete={onComplete}
        onError={onError}
        config={{
          credentialProvider: async () => ({
            ...session.credentials,
            expiration: new Date(session.credentials.expiration),
          }),
        }}
      />
    </ThemeProvider>
  );
}
