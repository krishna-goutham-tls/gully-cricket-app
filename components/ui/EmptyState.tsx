export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-9 text-center">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body ? (
        <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-muted">
          {body}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 flex justify-center [&>*]:min-h-12">{action}</div>
      ) : null}
    </div>
  );
}
