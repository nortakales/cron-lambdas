# Weather Sources Analysis (superseded)

This report has been replaced by **[docs/weather-alert-system.md](../../docs/weather-alert-system.md)**
(reviewed 2026-09-24). That doc has the full table of implemented sources, candidate sources, and known issues.

Facts from the previous version of this report that were wrong or have changed:

- **AccuWeather:** the free 50-call/day "Limited Trial" was discontinued in Sept 2025 (now a 14-day trial, then
  paid from $2/mo). The code does **not** fail over between two keys. It uses a single key, and the "alternate"
  secret is fetched but unused.
- **WeatherAPI.com:** the free tier is now 100,000 calls/month (not 1M), still limited to a 3-day forecast.
  The cheapest paid tier is $7/mo (not $4).
- **Visual Crossing:** the legacy `weatherdata/forecast` endpoint in use retires 2026-12-31.
- **Google Weather API:** GA since June 2025. 10,000 free events/month, then $0.15 per 1,000.
- **Weather.gov:** the "no alerts" entry is misleading. `/alerts/active?point=` is free, it's just not integrated.
