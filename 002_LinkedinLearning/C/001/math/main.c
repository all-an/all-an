#include <stdio.h>
#include <stdlib.h>
#include <math.h>

int main()
{
    //square root
    float r;

    r = sqrt(2.0);
    printf("The square root of r is: %f \n", r);

    //pow function
    float p;

    p = pow(2.0, 8.0);
    printf("2 to the 8th power is: %f \n", p);

    float a;
    float b;

    printf("Type the first number: ");
    scanf("%f", &a);
    printf("Type the second number: ");
    scanf("%f", &b);

    float o;

    o = a + b;
    printf("The sum of your two numbers is: %f\n", o);

    o = a - b;
    printf("The subtraction of your two numbers is: %f\n", o);

    o = a * b;
    printf("The multiplication of your two numbers is: %f\n", o);

    o = a / b;
    printf("The division of your two numbers is: %f\n", o);


    p = pow(a,b);
    printf("The first number to the power of the second is : %f\n",p);


    r = sqrt(a);
    printf("The square root of the first number is: %f \n",r);


    r = sqrt(b);
    printf("The square root of the second number is: %f",r);

    return 0;
}
