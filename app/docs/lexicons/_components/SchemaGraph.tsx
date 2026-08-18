// Darwin Core / Audiovisual Core star schema, ported from the lexplorer. Box and
// edge captions are record/field identifiers (kept verbatim); the small grey
// sub-labels are descriptive and passed in already translated. Colors use the
// app's theme CSS variables so the diagram tracks light/dark mode.

export function SchemaGraph({
  labels,
}: {
  labels: { samplingContext: string; measurementOrFact: string; audiovisualEvidence: string };
}) {
  const faint = "var(--muted-foreground)";
  const ink = "var(--foreground)";
  const primary = "var(--primary)";
  const bg = "var(--background)";

  return (
    <svg
      viewBox="0 0 780 300"
      className="mx-auto block w-full"
      style={{ maxWidth: 680 }}
      role="img"
      aria-label="Star schema linking event, occurrence, measurement, and audiovisual records"
    >
      <defs>
        <marker id="lex-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={primary} />
        </marker>
      </defs>

      {/* edges */}
      <line x1="300" y1="116" x2="190" y2="116" stroke={primary} strokeWidth="1" markerEnd="url(#lex-arr)" />
      <line x1="480" y1="116" x2="590" y2="116" stroke={primary} strokeWidth="1" markerEnd="url(#lex-arr)" />
      <line x1="390" y1="160" x2="390" y2="232" stroke={primary} strokeWidth="1" markerEnd="url(#lex-arr)" />

      <text x="245" y="106" fontSize="11" fill={primary} className="font-mono" textAnchor="middle">eventRef</text>
      <text x="535" y="106" fontSize="11" fill={primary} className="font-mono" textAnchor="middle">occurrenceRef</text>
      <text x="404" y="200" fontSize="11" fill={primary} className="font-mono" textAnchor="start">occurrenceRef</text>

      {/* event */}
      <rect x="30" y="90" width="160" height="52" fill={bg} stroke={ink} strokeWidth="1" />
      <text x="110" y="116" fontSize="13" className="font-mono" fill={ink} textAnchor="middle">event</text>
      <text x="110" y="132" fontSize="10" className="font-mono" fill={faint} textAnchor="middle">{labels.samplingContext}</text>

      {/* occurrence (focus) */}
      <rect x="300" y="78" width="180" height="76" fill={primary} stroke={primary} />
      <text x="390" y="104" fontSize="14" className="font-mono" fill={bg} textAnchor="middle">occurrence</text>
      <text x="390" y="123" fontSize="10" className="font-mono" fill={bg} opacity="0.72" textAnchor="middle">·scientificName</text>
      <text x="390" y="138" fontSize="10" className="font-mono" fill={bg} opacity="0.72" textAnchor="middle">·eventDate</text>

      {/* measurement */}
      <rect x="590" y="90" width="160" height="52" fill={bg} stroke={ink} strokeWidth="1" />
      <text x="670" y="116" fontSize="13" className="font-mono" fill={ink} textAnchor="middle">measurement</text>
      <text x="670" y="132" fontSize="10" className="font-mono" fill={faint} textAnchor="middle">{labels.measurementOrFact}</text>

      {/* ac media / audio */}
      <rect x="300" y="234" width="180" height="52" fill={bg} stroke={primary} strokeWidth="1" />
      <text x="390" y="260" fontSize="13" className="font-mono" fill={primary} textAnchor="middle">media · audio</text>
      <text x="390" y="276" fontSize="10" className="font-mono" fill={faint} textAnchor="middle">{labels.audiovisualEvidence}</text>
    </svg>
  );
}
