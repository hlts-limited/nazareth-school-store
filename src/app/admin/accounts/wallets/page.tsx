import { naira } from "@/shared/lib/format";
import { Card, Empty, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { adjustWalletAction, pupilsWithBalance } from "@/modules/wallet";
import { WalletAdjust } from "../../_components";

export const metadata = { title: "Pupil wallets" };

export default async function WalletsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("wallets.adjust");
  const { q } = await searchParams;
  const list = await pupilsWithBalance(q);
  return (
    <>
      <PageHeader title="Pupil wallets" sub="Balances come from the ledger. Every adjustment needs a reason and is logged." />
      <div className="stack">
        <div className="row" style={{ maxWidth: 460 }}><SearchParamInput param="q" id="w-q" placeholder="Find any pupil by name or reg number" /></div>
        <Card pad={false}>
          {list.length === 0 ? <Empty title={q ? "No pupils match" : "No wallet balances yet"}>Search for a pupil to adjust their wallet.</Empty> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Pupil</th><th>Reg no.</th><th>Class</th><th>Parent</th><th className="r">Balance</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Pupil"><b>{p.firstName} {p.lastName}</b></td><td data-label="Reg no." className="mono">{p.regNumber}</td><td data-label="Class">{p.class.name}</td>
                    <td data-label="Parent">{p.guardians[0] ? `${p.guardians[0].parent.firstName} ${p.guardians[0].parent.lastName}` : "—"}</td>
                    <td data-label="Balance" className="r tnum"><b>{naira(p.balance)}</b></td>
                    <td data-label="" className="r"><WalletAdjust action={adjustWalletAction} pupilId={p.id} name={`${p.firstName} ${p.lastName}`} balance={p.balance} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
