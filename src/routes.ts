import { FastifyInstance } from "fastify";
import { prisma } from "./lib/prisma";
import { z } from "zod";
import dayjs from "dayjs";

export async function appRoutes(app: FastifyInstance) {
  app.post("/habits", async (req) => {
    const createHabitBody = z.object({
      title: z.string(),
      WeekDays: z.array(z.number().min(0).max(6)),
    });
    const { title, WeekDays } = createHabitBody.parse(req.body);

    const today = dayjs().startOf("day").toDate();

    await prisma.habit.create({
      data: {
        title,
        created_at: today,
        WeekDays: {
          create: WeekDays.map((weekDay) => {
            return {
              week_day: weekDay,
            };
          }),
        },
      },
    });
  });

  app.get("/day", async (req) => {
    const getDayParms = z.object({
      date: z.coerce.date(),
    });

    const { date } = getDayParms.parse(req.query);

    const parsedDate = dayjs(date).startOf("day");

    const weekDay = parsedDate.day();

    const possiblehabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        WeekDays: {
          some: {
            week_day: weekDay,
          },
        },
      },
    });

    const day = await prisma.day.findUnique({
      where: {
        date: parsedDate.toDate(),
      },
      include: {
        dayHabits: true,
      },
    });

    const completedHabits = day?.dayHabits.map((dayhabit) => dayhabit.habit_id);

    return { possiblehabits, completedHabits };
  });

  app.patch("/habits/:id/toggle", async (req) => {
    const habitToggle = z.object({
      id: z.string().uuid(),
    });

    const { id } = habitToggle.parse(req.params);

    const today = dayjs().startOf("day").toDate();

    let day = await prisma.day.findUnique({
      where: {
        date: today,
      },
    });

    if (!day) {
      day = await prisma.day.create({
        data: {
          date: today,
        },
      });
    }

    const dayhabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id: {
          day_id: day.id,
          habit_id: id,
        },
      },
    });

    if (dayhabit) {
      await prisma.dayHabit.delete({
        where: {
          day_id_habit_id: {
            day_id: day.id,
            habit_id: id,
          },
        },
      });
    } else {
      await prisma.dayHabit.create({
        data: {
          day_id: day.id,
          habit_id: id,
        },
      });
    }
  });

  app.get("/summary", async (req) => {
    const summary = await prisma.$queryRaw`
      SELECT 
        D.id,
        D.date,
        (
          SELECT cast(count(*) as float)  
          FROM days_habits DH WHERE DH.day_id = D.id
        ) as completed,
        (
          SELECT cast(count(*) as float)
          FROM habit_week_days HWD 
          JOIN habits H ON H.id = HWD.habit_id
          WHERE 
            HWD.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
            AND H.created_at <= D.date
        ) as amount
      FROM DAYS D
    `;

    return summary;
  });
}
