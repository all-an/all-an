package main

// A minimal binding to libpq, the PostgreSQL client library. Only what the messages store needs.
// Queries always go through PQexecParams, so values travel separately from the SQL text.

import "core:c"

foreign import pq "system:pq"

PGconn :: distinct rawptr
PGresult :: distinct rawptr

ConnStatusType :: enum c.int {
	OK,
	BAD,
}

ExecStatusType :: enum c.int {
	EMPTY_QUERY,
	COMMAND_OK,
	TUPLES_OK,
	COPY_OUT,
	COPY_IN,
	BAD_RESPONSE,
	NONFATAL_ERROR,
	FATAL_ERROR,
	COPY_BOTH,
	SINGLE_TUPLE,
}

@(default_calling_convention = "c")
foreign pq {
	PQconnectdb :: proc(conninfo: cstring) -> PGconn ---
	PQstatus :: proc(conn: PGconn) -> ConnStatusType ---
	PQreset :: proc(conn: PGconn) ---
	PQfinish :: proc(conn: PGconn) ---
	PQerrorMessage :: proc(conn: PGconn) -> cstring ---

	PQexec :: proc(conn: PGconn, command: cstring) -> PGresult ---
	PQexecParams :: proc(
		conn: PGconn,
		command: cstring,
		nParams: c.int,
		paramTypes: [^]u32,
		paramValues: [^]cstring,
		paramLengths: [^]c.int,
		paramFormats: [^]c.int,
		resultFormat: c.int,
	) -> PGresult ---

	PQresultStatus :: proc(res: PGresult) -> ExecStatusType ---
	PQresultErrorMessage :: proc(res: PGresult) -> cstring ---
	PQntuples :: proc(res: PGresult) -> c.int ---
	PQgetvalue :: proc(res: PGresult, row_number: c.int, column_number: c.int) -> cstring ---
	PQgetisnull :: proc(res: PGresult, row_number: c.int, column_number: c.int) -> c.int ---
	PQclear :: proc(res: PGresult) ---
}
