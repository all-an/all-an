#include <stdio.h>
#include <stdlib.h>

int main()
{
    int input;

    printf("Type a value (1,2,3): ");
    scanf("%d",&input);

    if(input==1)
        printf("Red\n");
    else if(input==2)
        printf("Green\n");
    else if(input==3)
        printf("Blue\n");
    else
        printf("Invalid input\n");

    char c;
    printf("Type A, B or C: ");
    scanf("%c", &c);

    switch(c){
        case 'A':
            puts("Typed A");
            break;
        case 'a':
            puts("Typed a");
            break;
        case 'B':
            puts("Typed B");
            break;
        case 'b':
            puts("Typed b");
            break;
        case 'C':
            puts("Typed C");
            break;
        case 'c':
            puts("Typed c");
            break;
        default:
            puts("Type one of the three characters");
    }

    int a;
    printf("Type 1, 2 or 3: ");
    scanf("%d", &a);

    switch(a){
        case 1:
            puts("Typed 1");
            break;
        case 2:
            puts("Typed 2");
            break;
        case 3:
            puts("Typed 3");
            break;
        default:
            puts("Type one of the three numbers");
    }
    return 0;
}
