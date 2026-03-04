import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { OutboxStatus } from "./outbox.entity";

@Entity("outbox")
export class OutboxIntEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  topic!: string;

  @Column("simple-json")
  payload: any;

  @Column({ nullable: true })
  key!: string;

  @Column({ default: OutboxStatus.PENDING })
  status!: OutboxStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  processedAt!: Date;

  @Column({ default: 0 })
  attempts!: number;

  @Column({ type: "text", nullable: true })
  lastError!: string;
}
