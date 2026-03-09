import DemoSceneClient from "./DemoSceneClient";

// Generate static params for static export
export async function generateStaticParams() {
  // For static export, we need to provide the possible scene names
  // Since demo scenes are dynamic and stored in localStorage, we'll provide
  // a basic set of known scenes that should be statically generated
  return [
    { sceneName: "simple-image-rectangle" },
    // Add more scene names here as needed
  ];
}

export default function DemoScenePage() {
  return <DemoSceneClient />;
}
