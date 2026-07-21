import { WiRain } from 'react-icons/wi';
import { Card, CardHeader, CardPanel, CardTitle } from '@/components/ui/card';
import PrecipBarsChart from './charts/PrecipBarsChart';
import { adaptNowcastPrecip } from '../utils/chartAdapters';

export default function NowcastBar({ aladin }) {
  const next10 = adaptNowcastPrecip(aladin, 10);

  if (!next10.length) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Srážkový výhled</CardTitle>
            <span className="text-xs text-muted-foreground">Aladin</span>
          </div>
        </CardHeader>
        <CardPanel className="flex flex-1 items-center">
          <p className="text-sm text-muted-foreground">Výhled srážek teď není k dispozici.</p>
        </CardPanel>
      </Card>
    );
  }

  const totalNext3h = next10.slice(0, 3).reduce((sum, h) => sum + h.precip, 0);

  let message = 'V příštích hodinách nečekáme srážky.';
  if (totalNext3h > 2) message = 'Pozor, v nejbližší době bude pršet.';
  else if (totalNext3h > 0) message = 'Možné slabé přeháňky.';

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Srážkový výhled</CardTitle>
          <span className="text-xs text-muted-foreground">Aladin</span>
        </div>
      </CardHeader>
      <CardPanel className="flex flex-1 flex-col justify-between">
        <PrecipBarsChart aladin={aladin} />
        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-foreground">
          <WiRain className="size-5 text-info" aria-hidden="true" />
          {message}
        </div>
      </CardPanel>
    </Card>
  );
}
