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

        const completedHabits = day?.DayHabits.map((dayHabit) => dayHabit.habit_id);

        return {
            available: availableHabitsOnDay,
            completed: completedHabits,
        }
    });
}