import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Classroom, Course, AuditLog } from "../../types";
import {
  Building2,
  Users,
  BookOpen,
  MapPin,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Edit2,
  Sliders,
  X,
} from "lucide-react";

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Classroom edit modal
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [newRadius, setNewRadius] = useState<number>(50);
  const [isCreatingClassroom, setIsCreatingClassroom] = useState(false);
  const [newRoomCode, setNewRoomCode] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomBuilding, setNewRoomBuilding] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState("1st Floor");
  const [newRoomLat, setNewRoomLat] = useState("12.971598");
  const [newRoomLng, setNewRoomLng] = useState("77.594562");
  const [newRoomRadius, setNewRoomRadius] = useState(60);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, classRes, courseRes, logsRes] = await Promise.all([
        api.admin.getStats(),
        api.classrooms.list(),
        api.courses.list(),
        api.admin.getAuditLogs(),
      ]);

      setStats(statsRes.metrics);
      setClassrooms(classRes.classrooms);
      setCourses(courseRes.courses);
      setAuditLogs(logsRes.logs);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassroom) return;
    try {
      await api.classrooms.update(editingClassroom.id, {
        geofenceRadiusMeters: Number(newRadius),
      });
      setEditingClassroom(null);
      await loadData();
    } catch (err: any) {
      alert("Failed to update geofence radius: " + err.message);
    }
  };

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.classrooms.create({
        code: newRoomCode,
        name: newRoomName,
        building: newRoomBuilding,
        floor: newRoomFloor,
        latitude: Number(newRoomLat),
        longitude: Number(newRoomLng),
        geofenceRadiusMeters: Number(newRoomRadius),
      });
      setIsCreatingClassroom(false);
      setNewRoomCode("");
      setNewRoomName("");
      setNewRoomBuilding("");
      await loadData();
    } catch (err: any) {
      alert("Failed to add classroom: " + err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Institutional Administration
            </span>
            <span className="text-xs text-indigo-200">System Operations & Security</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {user?.fullName}
          </h1>
          <p className="text-sm text-indigo-200/80 mt-1">
            Configure campus geofencing perimeters, inspect audit logs, and monitor institutional attendance compliance.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Enrolled Students</p>
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats?.totalStudents ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Across all departments</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Faculty</p>
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats?.totalFaculty ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Course instructors</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Courses</p>
            <BookOpen className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats?.totalCourses ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Academic curriculum</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance Logs</p>
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{stats?.totalRecords ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Verified check-in records</p>
        </div>
      </div>

      {/* Classroom Geofencing Configuration */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Campus Classrooms & Geofence Boundaries
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Classrooms enforce Haversine GPS distance checking within a designated radius in meters
            </p>
          </div>

          <button
            onClick={() => setIsCreatingClassroom(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Classroom
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Classroom Name & Code</th>
                <th className="py-3 px-4">Building & Floor</th>
                <th className="py-3 px-4">GPS Coordinates</th>
                <th className="py-3 px-4">Geofence Radius</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {classrooms.map((cr) => (
                <tr key={cr.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{cr.name}</div>
                    <div className="text-[11px] font-mono text-indigo-700">{cr.code}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <div>{cr.building}</div>
                    <div className="text-[11px] text-slate-400">{cr.floor}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                    {cr.latitude.toFixed(6)}, {cr.longitude.toFixed(6)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-bold font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {cr.geofenceRadiusMeters} meters
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Active
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setEditingClassroom(cr);
                        setNewRadius(cr.geofenceRadiusMeters);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold text-[11px] text-slate-700 inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <Sliders className="w-3 h-3 text-indigo-600" />
                      Adjust Radius
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Audit Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Immutable Institutional Audit Logs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographically logged trail of all sign-ins, session launches, verification attempts, and overrides
          </p>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Actor</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Resource</th>
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {auditLogs.slice(0, 25).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-bold text-slate-900">{log.actorName}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {log.actorRole}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-600">{log.targetResource}</td>
                  <td className="py-2.5 px-4 max-w-sm truncate text-slate-600 text-[11px]">
                    {log.details}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Geofence Radius Modal */}
      {editingClassroom && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Adjust Geofence Perimeter: {editingClassroom.name}
              </h3>
              <button
                onClick={() => setEditingClassroom(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateGeofence} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Geofence Radius (Meters)
                </label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={newRadius}
                  onChange={(e) => setNewRadius(Number(e.target.value))}
                  required
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Students attempting attendance beyond {newRadius}m will be flagged as OUT_OF_BOUNDS.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                Save New Perimeter to Database
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Classroom Modal */}
      {isCreatingClassroom && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add New Campus Classroom</h3>
              <button
                onClick={() => setIsCreatingClassroom(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClassroom} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Classroom Code</label>
                <input
                  type="text"
                  required
                  placeholder="E.g., CS-LH-401"
                  value={newRoomCode}
                  onChange={(e) => setNewRoomCode(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Classroom Name</label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Von Neumann Seminar Hall"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Building</label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Computing Sciences Tower"
                  value={newRoomBuilding}
                  onChange={(e) => setNewRoomBuilding(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={newRoomLat}
                    onChange={(e) => setNewRoomLat(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={newRoomLng}
                    onChange={(e) => setNewRoomLng(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Radius (Meters)</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  required
                  value={newRoomRadius}
                  onChange={(e) => setNewRoomRadius(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition"
              >
                Create Classroom Record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
