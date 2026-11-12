import { naira } from "@/shared/lib/format";
import { Card, PageHeader } from "@/shared/ui/primitives";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { adjustWalletAction, pupilsWithBalance } from "@/modules/wallet";
import { WalletAdjust } from "../_widgets";

export const metadata = { title: "Pupil wallets" };

export default async function WalletsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("wallets.adjust");
  const { q } = await searchParams;
  const list = await pupilsWithBalance(q);
  return (
    <>
      <PageHeader title="Pupil wallets" sub="Balances come from the ledger. Every adjustment needs a reason and is logged." />
      <div className="stack">
        <div className="row mw-460"><SearchParamInput param="q" id="w-q" placeholder="Find any pupil by name or reg number" /></div>
        <Card pad={false}>
          <DataTable
            empty={q ? "No pupils match" : "No wallet balances yet"} emptyText="Search for a pupil to adjust their wallet."
            columns={[{ label: "Pupil", sortable: true }, { label: "Reg no.", sortable: true }, { label: "Class", sortable: true }, { label: "Parent", sortable: true }, { label: "Balance", right: true, sortable: true }, { label: "", right: true }]}
            initialSort={{ col: 4, dir: "desc" }}
            rows={list.map((p) => {
              const parent = p.guardians[0] ? `${p.guardians[0].parent.firstName} ${p.guardians[0].parent.lastName}` : "—";
              return {
                id: p.id,
                sort: [`${p.lastName} ${p.firstName}`, p.regNumber, p.class.name, parent, p.balance, null],
                cells: keyed([
                  <b key="n">{p.firstName} {p.lastName}</b>, <span key="r" className="mono">{p.regNumber}</span>, p.class.name, parent,
                  <b key="b" className="tnum">{naira(p.balance)}</b>,
                  <WalletAdjust key="a" action={adjustWalletAction} pupilId={p.id} name={`${p.firstName} ${p.lastName}`} balance={p.balance} />,
                ]),
              };
            })}
          />
        </Card>
      </div>
    </>
  );
}
