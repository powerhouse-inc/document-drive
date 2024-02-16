import { DocumentDriveServer } from '..';

function ListenerManagerDecorator(constructor: new () => DocumentDriveServer) {
    return class extends constructor {
        // Define extra methods here
        extraMethod(): void {
            // Access private variables of the original class
            console.log('Accessing private variable:', this.getLi);
        }
    };
}

// Define your original class
class OriginalClass {
    private privateVariable: string;

    constructor(privateVariable: string) {
        this.privateVariable = privateVariable;
    }

    // Define other methods and properties here
}

// Use the decorator to augment the original class with extra methods
const AugmentedClass = ExtraMethodsDecorator(OriginalClass);

// Create an instance of the augmented class
const instance = new AugmentedClass('private data');
