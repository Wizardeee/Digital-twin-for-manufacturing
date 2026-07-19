export default function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-5, 8, -5]} intensity={0.5} />
      <pointLight position={[0, 5, 0]} intensity={0.3} color="#6366f1" />
    </>
  );
}
