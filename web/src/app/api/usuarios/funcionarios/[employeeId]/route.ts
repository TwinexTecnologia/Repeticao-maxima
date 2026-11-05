import { NextResponse } from "next/server";

import { authorizeApiAccess } from "@/lib/auth/access";
import { updateEmployeeAccessUser } from "@/lib/usuarios/repository";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const authorization = await authorizeApiAccess("usuarios");

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = await request.json();
    const { employeeId } = await context.params;
    const result = await updateEmployeeAccessUser(employeeId, body);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.persistence.message,
          persistence: result.persistence,
        },
        { status: result.persistence.enabled ? 500 : 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.persistence.message,
      persistence: result.persistence,
      employee: result.employee,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel atualizar os acessos do funcionario.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
