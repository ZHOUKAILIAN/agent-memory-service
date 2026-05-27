import type { FastifyInstance } from "fastify";

import { createProjectSchema, resolveProjectSchema } from "../modules/projects/project-schema.js";
import type { ProjectRepository } from "../modules/projects/project-repository.js";

type ProjectRouteDependencies = {
  projectRepository: ProjectRepository;
};

export function registerProjectRoutes(app: FastifyInstance, dependencies: ProjectRouteDependencies) {
  app.post("/projects", async (request, reply) => {
    const payload = createProjectSchema.parse(request.body);
    const project = await dependencies.projectRepository.createProject(payload);

    return reply.code(201).send({ project });
  });

  app.post("/projects/resolve", async (request, reply) => {
    const payload = resolveProjectSchema.parse(request.body);

    if (payload.repo_url && dependencies.projectRepository.findProjectByRepoUrl) {
      const existingByRepoUrl = await dependencies.projectRepository.findProjectByRepoUrl(payload.repo_url);

      if (existingByRepoUrl) {
        return reply.code(200).send({ project: existingByRepoUrl });
      }
    }

    if (dependencies.projectRepository.findProjectByName) {
      const existingByName = await dependencies.projectRepository.findProjectByName(payload.name);

      if (existingByName) {
        return reply.code(200).send({ project: existingByName });
      }
    }

    const project = await dependencies.projectRepository.createProject(payload);
    return reply.code(200).send({ project });
  });
}
