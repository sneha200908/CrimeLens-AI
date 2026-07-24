import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

function getMarkerColor(severity) {
  if (severity === "High") return "#dc2626";
  if (severity === "Medium") return "#f59e0b";
  return "#16a34a";
}

function getRiskColor(score) {
  if (score >= 80) return "#b91c1c";
  if (score >= 62) return "#dc2626";
  if (score >= 42) return "#f59e0b";
  return "#16a34a";
}

function getMarkerRadius(crime) {
  const riskRadius = Math.round((crime.riskScore || 35) / 7);
  return Math.max(8, Math.min(18, riskRadius));
}

function CrimeMap({ crimes }) {
  return (
    <div className="map-wrap">
      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={7}
        scrollWheelZoom={false}
        className="crime-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {crimes.map((crime) => (
          <CircleMarker
            key={crime.caseId}
            center={[crime.latitude, crime.longitude]}
            radius={getMarkerRadius(crime)}
            pathOptions={{
              color: getRiskColor(crime.riskScore) || getMarkerColor(crime.severity),
              fillColor: getRiskColor(crime.riskScore) || getMarkerColor(crime.severity),
              fillOpacity: 0.68,
            }}
          >
            <Popup>
              <strong>{crime.area}</strong>
              <br />
              Category: {crime.crimeType}
              <br />
              Total crimes: {crime.totalCrimes || 0}
              <br />
              Severity: {crime.severity}
              <br />
              AI risk: {crime.riskScore || 0}/100 ({crime.riskLevel || "Watch"})
              <br />
              Patrol window: {crime.patrolWindow || "7 PM - 11 PM"}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-legend">
        <span><i className="critical" /> Critical</span>
        <span><i className="high" /> High</span>
        <span><i className="moderate" /> Moderate</span>
        <span><i className="watch" /> Watch</span>
      </div>
    </div>
  );
}

export default CrimeMap;
