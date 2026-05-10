const { pool } = require('../config/db');

const oldEmpId = (process.argv[2] || '3').trim();
const newEmpId = (process.argv[3] || '51').trim();

if (!oldEmpId || !newEmpId) {
    console.error('Usage: node server/scripts/update_emp_id_everywhere.js <oldEmpId> <newEmpId>');
    process.exit(1);
}

if (oldEmpId === newEmpId) {
    console.error('Old and new employee IDs are the same. Nothing to do.');
    process.exit(1);
}

const updatePlan = [
    { table: 'attendance_records', column: 'emp_id' },
    { table: 'attendance', column: 'emp_id' },
    { table: 'leave_requests', column: 'emp_id' },
    { table: 'leave_requests', column: 'alternative_staff_id' },
    { table: 'leave_balances', column: 'emp_id' },
    { table: 'leave_limits', column: 'emp_id' },
    { table: 'purchases', column: 'emp_id' },
    { table: 'conversations', column: 'creator_id' },
    { table: 'messages', column: 'sender_id' },
    { table: 'timetable', column: 'emp_id' },
    { table: 'salary_records', column: 'emp_id' },
    { table: 'leave_approvals', column: 'approver_id' },
    { table: 'permission_requests', column: 'emp_id' },
    { table: 'permission_approvals', column: 'approver_id' },
    { table: 'birthday_log', column: 'emp_id' },
    { table: 'notifications', column: 'user_id' },
    { table: 'biometric_logs', column: 'emp_id' },
    { table: 'biometric_attendance', column: 'user_id' },
    { table: 'push_subscriptions', column: 'user_id' }
];

function addOnUpdateCascade(constraintDefinition) {
    const withoutOnUpdate = constraintDefinition.replace(/\s+ON UPDATE\s+(NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)/i, '');
    return `${withoutOnUpdate} ON UPDATE CASCADE`;
}

async function ensureEmpIdForeignKeysCascade(client) {
    const { rows } = await client.query(`
        SELECT
            con.conname,
            con.conrelid::regclass::text AS table_name,
            pg_get_constraintdef(con.oid) AS constraint_definition
        FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.connamespace = 'public'::regnamespace
          AND con.confrelid = 'public.users'::regclass
          AND array_length(con.confkey, 1) = 1
          AND (
              SELECT attname
              FROM pg_attribute
              WHERE attrelid = con.confrelid AND attnum = con.confkey[1]
          ) = 'emp_id'
    `);

    for (const row of rows) {
        if (/\sON UPDATE\s+CASCADE\b/i.test(row.constraint_definition)) {
            continue;
        }

        const tableName = row.table_name;
        const constraintName = row.conname;
        const newConstraintDef = addOnUpdateCascade(row.constraint_definition);

        await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`);
        await client.query(`ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ${newConstraintDef}`);
    }
}

async function tableAndColumnExist(client, table, column) {
    const query = `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
    `;
    const { rows } = await client.query(query, [table, column]);
    return rows.length > 0;
}

async function run() {
    const client = await pool.connect();

    try {
        console.log(`Starting employee ID migration: ${oldEmpId} -> ${newEmpId}`);
        await client.query('BEGIN');

        const { rows: sourceUser } = await client.query(
            'SELECT id, emp_id, name, role FROM users WHERE emp_id = $1 FOR UPDATE',
            [oldEmpId]
        );

        if (sourceUser.length === 0) {
            throw new Error(`User with emp_id '${oldEmpId}' not found.`);
        }

        const { rows: targetUser } = await client.query(
            'SELECT id, emp_id FROM users WHERE emp_id = $1',
            [newEmpId]
        );

        if (targetUser.length > 0) {
            throw new Error(`Target emp_id '${newEmpId}' already exists in users.`);
        }

        const summary = [];

        await ensureEmpIdForeignKeysCascade(client);

        const userUpdate = await client.query(
            'UPDATE users SET emp_id = $1 WHERE emp_id = $2',
            [newEmpId, oldEmpId]
        );

        if (userUpdate.rowCount !== 1) {
            throw new Error('Failed to update users.emp_id exactly once.');
        }

        // Update columns that may not be constrained by FK (or legacy tables that were skipped).
        for (const item of updatePlan) {
            const exists = await tableAndColumnExist(client, item.table, item.column);
            if (!exists) {
                continue;
            }

            const result = await client.query(
                `UPDATE ${item.table} SET ${item.column} = $1 WHERE ${item.column} = $2`,
                [newEmpId, oldEmpId]
            );

            if (result.rowCount > 0) {
                summary.push(`${item.table}.${item.column}: ${result.rowCount}`);
            }
        }

        await client.query('COMMIT');

        console.log('Employee ID migration completed successfully.');
        console.log(`Updated user: ${sourceUser[0].name} (${oldEmpId} -> ${newEmpId})`);
        if (summary.length) {
            console.log('Updated related records:');
            for (const line of summary) {
                console.log(`  - ${line}`);
            }
        } else {
            console.log('No related records needed updates.');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed. Rolled back all changes.');
        console.error(error.message || error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run();
