export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center px-8 text-center">
      <div>
        <div className="mb-3 text-5xl">📡</div>
        <h1 className="text-xl font-bold">אין חיבור לאינטרנט</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--fg-dim)' }}>
          ההוצאות שכבר נטענו שמורות במכשיר. ברגע שתהיה קליטה הכול יסתנכרן.
        </p>
      </div>
    </main>
  );
}
