# Forecast accuracy benchmark

`/benchmark` compares what each source forecast with what ČHMÚ stations then measured: how accurate each source is, how far ahead it stays useful, and how it improves as the time approaches.

## Turning it on

The collector starts only where `BENCHMARK_DATA_DIR` is set, so Vercel and other short-lived hosts never run it.

- **Docker Compose:** `docker-compose.yml` sets the variable and a named volume. Nothing else to do.
- **Dokploy or a plain `docker run`:** add a volume mount at `/data/benchmark`, then set `BENCHMARK_DATA_DIR=/data/benchmark`. Without the mount, every redeploy deletes the data.

The UI on Vercel reads results from the API host through `VITE_API_BASE`. A short-lived host answers `{ "enabled": false }`.

It needs Node 22.13 or newer for the built-in `node:sqlite`. There is no new dependency. If storage or SQLite is unavailable, the API keeps running and the page shows the reason.

## What runs

| Step | When | What |
| --- | --- | --- |
| Snapshot | 01:20, 07:20, 13:20 and 19:20 UTC | Stores each source's hourly forecast for 12 stations, using the same parsing and merging as the home page. |
| Commercial and unofficial sources | 07:20 and 19:20 UTC, Praha and Brno only | Four loads a day per source, because of daily quotas and unclear terms. |
| Measurements | After each snapshot | Reads ČHMÚ's 10-minute feed. It keeps three days, so a short outage loses nothing. |
| Scoring | After each snapshot | Adds forecasts whose time has come to the error totals. A row is marked in the same transaction, so nothing is counted twice. |
| Archive | In the background | Scores Open-Meteo's Previous Runs for the last three finished months, one request per station and month, 30 s apart. New months join by themselves. |

## How it scores

- **Lead** is the time between storing a forecast and the hour it describes, not the age of the model run. That is what a visitor experienced.
- **Temperature and wind:** mean absolute error, bias and share of forecasts within ±2 °C or ±5 km/h, against the reading at the full hour.
- **Rain:** six-hour totals, with an event at 0.5 mm or more. One-hour windows would count a shower one hour off as both a miss and a false alarm, and sources disagree on whether a step's rain falls before or after its timestamp. The score is ETS, shown with hit rate and false alarm ratio because ETS alone is sensitive to bias.
- **Cold rain is not scored:** if any hour of the window is at 2 °C or below, the window is skipped, because unheated gauges can miss snow.
- **Reach** is how far a source forecasts at all, up to the seven days the app asks for. **Useful horizon** is how far its bucket errors stay within 2 °C, 5 km/h or ETS 0.2.
- **Baseline:** "the same hour on the latest whole day known at issue". A source that does not beat it adds nothing.
- **Fair comparison:** commercial sources run at two stations only, so "Proti konsenzu" compares each source with the open consensus only on the station-months and leads where that source was measured.

Two consensus lines answer whether the commercial sources help: `consensus` uses every source and exists only at the two stations and two slots above, while `consensus_open` uses open sources and exists in every snapshot.

## Limits

- Results come from a point at a station, while a model describes a grid cell, so no source reaches zero error. Stations also feed the models' starting conditions.
- Ranks are withheld for 14 days or under 200 pairs. Hourly errors are strongly correlated, so a large pair count does not mean high certainty, and small differences between sources are not meaningful.
- Sources with 3-hourly steps (wttr.in, probably Počasí.cz at long leads) get no rain score, because a window with gaps has no total.
- WeatherAPI reports only the current day, and Pirate Weather 48 hours, so their curves stop there.
- The archive covers only Open-Meteo's deterministic models. Its day-sized buckets come from the age of the run, so it is not directly comparable with live numbers. Its reach stops at seven days because the old runs do, so seven days there means "at least seven".
- The archive's consensus is built from those models alone, with weights partly tuned on the same months. Treat its lead over single models as an upper estimate until live data confirms it.
- DWD ICON takes ICON-D2's values for as long as ICON-D2 reaches, so the two match in the first two days. Both still enter the consensus, as they do on the home page.
- AROME returned values only for Praha, Plzeň, České Budějovice, Cheb and Doksany, so it has fewer pairs than the other models.
- Pirate Weather's hourly block and all keyed sources were not exercised during development, because the keys live on the API host.

## Terms

Commercial forecasts are deleted as soon as they are scored, and the public target view shows only open sources. Their terms on storage and on publishing comparisons could not be confirmed, so check them if a provider objects to appearing on the page. Measured data is credited to ČHMÚ on the page, and the archive to Open-Meteo (CC BY 4.0).

## Storage

`benchmark.sqlite` holds raw open forecasts for 60 days. One slot measured 1.2 MB with its indexes, so that levels off at about 300 MB. Scores and measurements stay indefinitely and should add roughly 20 MB a year, estimated from row sizes. Back up the volume if the history matters, since live data cannot be recreated.
