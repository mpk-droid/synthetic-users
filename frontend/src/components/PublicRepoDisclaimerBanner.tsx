export function PublicRepoDisclaimerBanner() {
  return (
    <div className="disclaimer-banner" role="note">
      <span className="badge badge--disclaimer">Important</span>
      <p>
        Only run this for public or open-source repositories — we use Nemotron models as of now.
        This site does not yet implement PII handling or related data protections.
      </p>
    </div>
  );
}
