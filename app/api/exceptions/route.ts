import { jsonError, runAction } from "../_lib";
import { readState } from "@/lib/server/service";
import { NextResponse } from "next/server";
import type { ExceptionType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: ExceptionType[] = ["Damaged", "Missing", "Short Pick", "QC Fail"];

export function GET() {
  const { state, version } = readState();
  return NextResponse.json({ ok: true, version, exceptions: state.exceptions });
}

export async function POST(req: Request) {
  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("body must be JSON: { \"type\": \"Missing\" }", 400);
  }
  const type = body.type as ExceptionType;
  if (!TYPES.includes(type)) {
    return jsonError(`invalid exception type — expected one of ${TYPES.join(", ")}`, 400);
  }
  return runAction({ type: "injectException", exceptionType: type });
}
