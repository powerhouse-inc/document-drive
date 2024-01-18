export interface ITransmitter {
    process(): void;
}

export interface Transmitter {
    process(): ITransmitter;
}
