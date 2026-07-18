import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProcessSchedulesWorkspace from "@/components/schedules/ProcessSchedulesWorkspace";
import { getCurrentUserAccess } from "@/lib/crm/access";
import {
  schemaMissingDevHint,
  schemaMissingStaffMessage,
} from "@/lib/crm/dev-diagnostics";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listProcessSchedules } from "@/lib/crm/process-schedules";
import { listAllProjects } from "@/lib/crm/projects";
import {
  getScheduleAccess,
  listEmployeesInScope,
  listTeams,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { Employee, ProjectProcessSchedule, Team } from "@/types/database";

const PROCESS_MIGRATION_PATH =
  "supabase/migrations/20260725000001_customer_and_process_schedules.sql";
const PROJECTS_MIGRATION_PATH =
  "supabase/migrations/20260722000001_customer_projects.sql";

async function isProcessScheduleTableMissing(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("project_process_schedules")
      .select("id")
      .limit(1);
    if (!error) return false;
    return isMissingRelationError(new Error(error.message));
  } catch {
    return false;
  }
}

async function isProjectsTableMissing(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("projects").select("id").limit(1);
    if (!error) return false;
    return isMissingRelationError(new Error(error.message));
  } catch {
    return true;
  }
}

export default async function ProcessSchedulesPage() {
  const access = await getScheduleAccess();
  const userAccess = await getCurrentUserAccess();
  const processDevHint = schemaMissingDevHint(
    PROCESS_MIGRATION_PATH,
    userAccess.isAdmin,
  );
  const projectsDevHint = schemaMissingDevHint(
    PROJECTS_MIGRATION_PATH,
    userAccess.isAdmin,
  );

  let schedules: ProjectProcessSchedule[] = [];
  let employees: Employee[] = [];
  let teams: Team[] = [];
  let projects: {
    id: string;
    name: string;
    customer_id: string;
    address: string | null;
    construction_start_at: string | null;
  }[] = [];
  let loadError: string | null = null;
  let processTableMissing = false;
  let projectsTableMissing = false;

  try {
    employees = await listEmployeesInScope(access);
  } catch {
    employees = [];
  }

  try {
    teams = await listTeams();
  } catch {
    teams = [];
  }

  try {
    const projectList = await listAllProjects();
    projects = projectList.map((p) => ({
      id: p.id,
      name: p.name,
      customer_id: p.customer_id,
      address: p.address,
      construction_start_at: p.construction_start_at ?? null,
    }));
  } catch (error) {
    projects = [];
    projectsTableMissing = await isProjectsTableMissing();
    if (!projectsTableMissing && error instanceof Error) {
      console.error("[listAllProjects]", error.message);
    }
  }

  try {
    schedules = await listProcessSchedules({}, access);
  } catch (error) {
    processTableMissing = await isProcessScheduleTableMissing();
    if (processTableMissing) {
      loadError = null;
    } else {
      loadError = "공사 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      if (error instanceof Error) {
        console.error("[listProcessSchedules page]", error.message);
      }
    }
  }

  const showWorkspace = !processTableMissing && !loadError;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {processTableMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("공사 스케줄")}
            </p>
            {processDevHint && <p className="mt-2 text-xs">{processDevHint}</p>}
          </div>
        )}

        {projectsTableMissing && !processTableMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {schemaMissingStaffMessage("현장 정보")}
            </p>
            {projectsDevHint && (
              <p className="mt-2 text-xs">{projectsDevHint}</p>
            )}
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {showWorkspace && (
          <ProcessSchedulesWorkspace
            initialSchedules={schedules}
            employees={employees}
            teams={teams}
            projects={projects}
            projectsTableMissing={projectsTableMissing}
            access={{
              canViewAll: access.canViewAll,
              canViewTeam: access.canViewTeam,
              employeeId: access.employeeId,
              role: access.role,
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
