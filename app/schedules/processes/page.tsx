import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProcessSchedulesWorkspace from "@/components/schedules/ProcessSchedulesWorkspace";
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

const PROCESS_MIGRATION_HINT =
  "supabase/migrations/20260725000001_customer_and_process_schedules.sql 을 Supabase SQL Editor에서 실행해 주세요.";

const PROJECTS_MIGRATION_HINT =
  "supabase/migrations/20260722000001_customer_projects.sql 을 Supabase SQL Editor에서 실행해 주세요.";

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
      loadError =
        error instanceof Error
          ? error.message
          : "공사 일정을 불러오지 못했습니다.";
      console.error("[listProcessSchedules page]", loadError);
    }
  }

  const showWorkspace = !processTableMissing && !loadError;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {processTableMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">공사 스케줄 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">{PROCESS_MIGRATION_HINT}</p>
          </div>
        )}

        {projectsTableMissing && !processTableMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">현장(projects) 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">
              공사 일정 등록을 위해 현장 테이블이 필요합니다. {PROJECTS_MIGRATION_HINT}
            </p>
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
