import { naira } from "@/shared/lib/format";
import { Card, Kpi, Note, PageHeader } from "@/shared/ui/primitives";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { adjustWalletAction, parentsWithBalance, totalHeld } from "@/modules/wallet";
import { WalletAdjust } from "../_widgets";

export const metadata = { title: "Parent wallets" };

/** Store credit the school owes families: one wallet per parent, used first at every checkout. */
export default async function WalletsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("wallets.adjust");
  const { q } = await searchParams;
  const [list, held] = await Promise.all([parentsWithBalance(q), totalHeld()]);
  return (
    <>
      <PageHeader title="Parent wallets" sub="Credit from approved returns, cancelled orders and overpayments. It's used first on each parent's next order. Every change is logged." />
      <div className="stack">
        <div className="grid g3"><Kpi label="Held in wallets" value={naira(held)} sub="Store credit owed to families" /></div>
        <Note icon="info">Returned items are credited here only after Accounts approves the return (Payments → Returns to approve). Paying money back to a parent is rare and needs a reason.</Note>
        <div className="row mw-460"><SearchParamInput param="q" id="w-q" placeholder="Find a parent by name, phone, or a child's name or reg number" /></div>
        <Card pad={false}>
          <DataTable
            empty={q ? "No parents match" : "No wallet balances yet"} emptyText="Search for a parent to adjust their wallet."
            columns={[{ label: "Parent", sortable: true }, { label: "Phone" }, { label: "Children", sortable: true }, { label: "Balance", right: true, sortable: true }, { label: "", right: true }]}
            initialSort={{ col: 3, dir: "desc" }}
            rows={list.map((p) => {
              const kids = p.guardianships.map((g) => g.pupil.firstName).join(", ");
              return {
                id: p.id,
                sort: [`${p.lastName} ${p.firstName}`, null, kids, p.balance, null],
                cells: keyed([
                  <b key="n">{p.firstName} {p.lastName}</b>, p.phone ?? "—", kids || "—",
                  <b key="b" className="tnum">{naira(p.balance)}</b>,
                  <WalletAdjust key="a" action={adjustWalletAction} parentId={p.id} name={`${p.firstName} ${p.lastName}`} balance={p.balance} />,
                ]),
              };
            })}
          />
        </Card>
      </div>
    </>
  );
}
