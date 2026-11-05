import { Link, useParams } from "react-router-dom";
import IncidentView from "../components/IncidentView";

// Full-page version of an incident. The same view also appears in the side panel.
export default function IncidentDetail() {
  const { id = "" } = useParams();
  return (
    <div className="max-w-4xl">
      <Link to="/incidents" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; All incidents
      </Link>
      <div className="mt-3">
        <IncidentView id={id} />
      </div>
    </div>
  );
}