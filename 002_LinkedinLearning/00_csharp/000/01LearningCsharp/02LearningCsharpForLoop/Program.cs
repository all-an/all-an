using System;

namespace _02LearningCsharpForLoop
{
    class Program
    {
        static void Main(string[] args)
        {
            int myVal = 15;

            int[] nums = new int[] { 3, 14, 15, 92, 6 };

            string str = "The quick brown fox jumps over the lazy fox";

            string[] hello = new string[] { "Hello World" };
            
            //ctrl + /  to comment multiple lines
            //the basic for loop
            //for (int i = 0; i < myVal; i++)
            
            for (int i = 0; i < (hello.Length) ; i++)
            {
                //Console.WriteLine("The variable i is: {0}", i);
                //Console.WriteLine(nums[i]);
                Console.WriteLine(hello[i]);
            }
            
            foreach (int i in nums)
            {
                Console.WriteLine("i is currently: {0}", i);
            }

            int count = 0;

            foreach (char i in str)
            {
                Console.Write(i);
                if (i == 'o')
                {
                    count++;
                }
            }
            Console.WriteLine("\nThere is {0} o's in the variable str", count);

            Console.WriteLine("Hello World!");
        }
    }
}
