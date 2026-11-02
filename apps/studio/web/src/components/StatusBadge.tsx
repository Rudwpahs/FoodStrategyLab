import React from 'react';
import { STATUS_LABELS, type ProjectStatus } from '@mat-lab/recipe-core';

export const StatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
