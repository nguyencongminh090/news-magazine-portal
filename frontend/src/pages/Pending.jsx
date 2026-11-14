/** Placeholder until the API exposes the endpoint this view needs (todo #10 "Don't"). */
export function Pending({ title, needs }) {
  return (
    <div className="wrap state">
      <h1>{title}</h1>
      <p>Content will appear here once the API provides {needs}.</p>
    </div>
  );
}
