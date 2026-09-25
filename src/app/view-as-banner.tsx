import { Icon } from "@/shared/ui/icon";

export function ViewAsBanner({ name, expiresAt, endAction }: { name: string; expiresAt: Date; endAction: () => Promise<void> }) {
  const mins = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
  return (
    <div className="viewas" role="status">
      <Icon name="eye" size="sm" /> Viewing as {name} · read-only · ends in {mins} min
      <form action={endAction} className="inline-form"><button type="submit">Exit</button></form>
    </div>
  );
}
