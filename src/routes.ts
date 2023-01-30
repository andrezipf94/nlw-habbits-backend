import { prisma } from './lib/prisma';
import { FastifyInstance, FastifyRequest } from "fastify";
import z from 'zod';
import dayjs from 'dayjs';

export async function appRoutes(app: FastifyInstance) {
    app.post('/habits', async (request: FastifyRequest) => {
        const createHabitBody = z.object({
            title: z.string(),
            weekdays: z.array(
                z.number().min(0).max(6)
            ),
        })
        const { title, weekdays } = createHabitBody.parse(request.body);
        const today = dayjs().startOf('day').toDate();
        await prisma.habit.create({
            data: {
                title,
                created_at: today,
                Weekdays: {
                    create: weekdays.map(weekday => ({
                        weekday
                    }))
                }
            }
        })
    });

    app.get('/day', async (request: FastifyRequest) => {
        const getDayParams = z.object({
            date: z.coerce.date()
        });
        const { date } = getDayParams.parse(request.query);
        const weekday = dayjs(date).get('day');

        const availableHabitsOnDay = await prisma.habit.findMany({
            where: {
                created_at: {
                    lte: date
                },
                Weekdays: {
                    some: {
                        weekday: {
                            equals: weekday
                        }
                    }
                }
            }
        });

        const day = await prisma.day.findUnique({
            where: {
                date: date,
            },
            include: {
                DayHabits: true,
            }
        })

        const completedHabits = day?.DayHabits.map((dayHabit) => dayHabit.habit_id) ?? [];

        return {
            available: availableHabitsOnDay,
            completed: completedHabits,
        }
    });

    app.patch('/habits/:id/toggle', async (request: FastifyRequest) => {
        const toggleHabitParams = z.object({
            id: z.string().uuid(),
        });
        const { id } = toggleHabitParams.parse(request.params);
        const today = dayjs().startOf('day').toDate();

        let day = await prisma.day.findUnique(({
            where: {
                date: today,
            },
        }));
        if (!day) {
            day = await prisma.day.create({
                data: {
                    date: today,
                }
            });
        }

        const dayHabit = await prisma.dayHabit.findUnique({
            where: {
                day_id_habit_id: {
                    day_id: day.id,
                    habit_id: id
                }
            }
        });
        if (dayHabit) {
            await prisma.dayHabit.delete({
                where: {
                    id: dayHabit.id
                }
            });
            return;
        }

        await prisma.dayHabit.create({
            data: {
                day_id: day.id,
                habit_id: id
            }
        })
    });
    
    app.get('/summary', async (request: FastifyRequest) => {
        const summary = await prisma.$queryRaw`
            SELECT 
                D.id,
                D.date,
                (
                    SELECT
                        cast(count(*) as float)
                    FROM day_habits DH
                    WHERE DH.day_id = D.id 
                ) AS completed,
                (
                    SELECT
                        cast(count(*) as float)
                    FROM habit_weekdays HWD
                    JOIN habits H
                        on H.id = HWD.habit_id
                    WHERE HWD.weekday = cast(strftime('%w', D.date / 1000.0, 'unixepoch') as int)
                        AND H.created_at <= D.date
                ) AS available
            FROM days D
        `;
        return summary;
    });
}